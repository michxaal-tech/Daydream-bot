/**
 * The dashboard. Runs in the same process as the bot, so it can read the live
 * settings, list the server's real channels and roles, and fire test messages
 * without any inter-process plumbing.
 *
 * Access control: log in with Discord, and you get in only if you hold Manage
 * Server in the guild the bot is configured for. Nothing here is public.
 */
import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PermissionsBitField } from 'discord.js';
import { assertCanPost } from '../lib/brand.js';
import { config, env } from '../lib/config.js';
import { updateSettings, getOverrides } from '../lib/settings.js';
import { logger } from '../lib/logger.js';
import { sendWelcome } from '../features/welcome/index.js';
import { runCheck, announce } from '../features/notifications/watcher.js';
import { getPlatform, platformIds } from '../features/notifications/platforms/index.js';
import { createPoll, endPoll, openPolls, parseOptions, LIMITS } from '../features/polls/index.js';
import { SESSION_COOKIE, createSession, readSession, parseCookies, setCookie, clearCookie } from './session.js';

const log = logger('web');
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'public');
const MANAGE_GUILD = PermissionsBitField.Flags.ManageGuild;
const WEBHOOK_MASK = '••••••••';

export function startDashboard(client) {
  const web = env.web;

  if (!web.enabled) {
    log.info('dashboard disabled (set DASHBOARD_ENABLED=true to turn it on)');
    return () => {};
  }
  // Missing config used to mean "don't listen", which on a host with a domain
  // shows up as a bare 502 that explains nothing. Listen anyway and serve the
  // reason instead.
  const problems = [
    !web.clientSecret && {
      name: 'DISCORD_CLIENT_SECRET',
      fix: 'Developer Portal → your app → OAuth2 → Client Secret. Copy it into your host\'s variables.',
    },
    !env.guildId && {
      name: 'DISCORD_GUILD_ID',
      fix: 'Your server id — long-press the server icon in Discord → Copy ID. The dashboard authorises against this server.',
    },
  ].filter(Boolean);

  if (problems.length) {
    for (const problem of problems) log.warn(`dashboard needs ${problem.name} — ${problem.fix}`);
    const stub = express();
    stub.disable('x-powered-by');
    stub.get('*', (req, res) => res.status(503).send(setupHelpPage(problems)));
    const stubServer = stub.listen(web.port, '0.0.0.0', () =>
      log.warn(`dashboard is showing a setup page on port ${web.port} until those are set`)
    );
    return () => stubServer.close();
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  const baseUrl = () => (web.baseUrl || '').replace(/\/$/, '');
  const redirectUri = () => `${baseUrl()}/callback`;
  const isSecure = () => baseUrl().startsWith('https://');

  // ── auth ────────────────────────────────────────────────────────────────
  app.get('/login', (req, res) => {
    if (!baseUrl()) {
      return res
        .status(500)
        .send(denied('DASHBOARD_URL is not set, so OAuth has nowhere to come back to.'));
    }
    const state = randomBytes(16).toString('hex');
    setCookie(res, 'oauth_state', state, { maxAgeMs: 10 * 60 * 1000, secure: isSecure() });

    const params = new URLSearchParams({
      client_id: env.clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'identify guilds',
      state,
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  app.get('/callback', async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const { code, state, error, error_description: errorDescription } = req.query;

    // Discord bounced us before we ever got a code — say so, don't blame state.
    if (error) {
      log.warn(`oauth denied by Discord: ${error} ${errorDescription ?? ''}`);
      return res
        .status(400)
        .send(
          denied(
            `Discord refused the login: <code>${escapeHtml(String(error))}</code>` +
              (errorDescription ? `<br>${escapeHtml(String(errorDescription))}` : '')
          )
        );
    }
    if (!code) {
      return res.status(400).send(denied('Discord sent no authorisation code. Start again below.'));
    }
    // The state cookie is the CSRF guard on the login leg itself. It goes
    // missing if the domain changed between /login and here, or if the browser
    // dropped the cookie — both need a fresh start rather than a retry.
    if (!state || state !== cookies.oauth_state) {
      return res
        .status(400)
        .send(
          denied(
            cookies.oauth_state
              ? 'This login was started somewhere else — most often a different domain. Start again below.'
              : 'The login cookie went missing. If Safari is blocking cookies for this site, allow them, then start again below.'
          )
        );
    }
    clearCookie(res, 'oauth_state');

    try {
      const token = await exchangeCode(String(code), redirectUri(), web.clientSecret);
      const [user, guilds] = await Promise.all([
        discordGet('/users/@me', token),
        discordGet('/users/@me/guilds', token),
      ]);

      const guild = guilds.find((g) => g.id === env.guildId);
      if (!guild) {
        return res.status(403).send(denied(`You're not in the server this bot manages.`));
      }
      if ((BigInt(guild.permissions) & MANAGE_GUILD) !== MANAGE_GUILD) {
        return res.status(403).send(denied('You need the Manage Server permission to use this dashboard.'));
      }

      setCookie(
        res,
        SESSION_COOKIE,
        createSession({ id: user.id, tag: user.username, avatar: user.avatar }),
        { secure: isSecure() }
      );
      log.info(`${user.username} (${user.id}) signed in`);
      res.redirect('/');
    } catch (err) {
      log.error('oauth callback failed:', err.message);
      res.status(500).send(
        denied(
          `Login failed: ${escapeHtml(err.message)}<br><br>The redirect URI this bot uses is ` +
            `<code>${escapeHtml(redirectUri())}</code> — it has to be registered, exactly, ` +
            `under Developer Portal → OAuth2 → Redirects.`
        )
      );
    }
  });

  app.post('/logout', (req, res) => {
    clearCookie(res, SESSION_COOKIE);
    res.json({ ok: true });
  });

  // ── gate ────────────────────────────────────────────────────────────────
  const requireAuth = (req, res, next) => {
    const session = readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    if (!session) return res.status(401).json({ error: 'Not signed in.' });

    // Cookie auth + state-changing request: verify the request came from us.
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin && baseUrl() && origin !== baseUrl()) {
        return res.status(403).json({ error: 'Cross-origin request refused.' });
      }
    }
    req.session = session;
    next();
  };

  app.get('/api/me', (req, res) => {
    const session = readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.json(session ? { signedIn: true, user: session } : { signedIn: false });
  });

  // ── state ───────────────────────────────────────────────────────────────
  app.get('/api/state', requireAuth, async (req, res) => {
    const guild = client.guilds.cache.get(env.guildId);
    if (!guild) return res.status(503).json({ error: 'The bot is not in that server (yet).' });

    res.json({
      settings: redact(config),
      overrides: Object.keys(getOverrides()),
      platforms: platformIds,
      guild: {
        name: guild.name,
        icon: guild.iconURL({ size: 128 }),
        memberCount: guild.memberCount,
        channels: guild.channels.cache
          .filter((c) => c.isTextBased() && !c.isThread())
          .map((c) => ({ id: c.id, name: c.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        roles: guild.roles.cache
          .filter((r) => !r.managed && r.id !== guild.id)
          .map((r) => ({ id: r.id, name: r.name, position: r.position }))
          .sort((a, b) => b.position - a.position),
      },
      polls: openPolls(),
      pollLimits: LIMITS,
      status: {
        uptimeMs: client.uptime,
        ping: Math.round(client.ws.ping),
        watching: (config.notifications?.accounts ?? []).filter((a) => a.enabled !== false).length,
      },
    });
  });

  app.post('/api/settings', requireAuth, (req, res) => {
    const patch = unredact(req.body?.patch, config);
    if (!patch || typeof patch !== 'object') {
      return res.status(400).json({ error: 'Expected a { patch: {...} } body.' });
    }
    try {
      updateSettings(patch, { who: `${req.session.tag} via dashboard` });
      res.json({ ok: true, settings: redact(config) });
    } catch (err) {
      log.error('settings save failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── actions ─────────────────────────────────────────────────────────────
  app.post('/api/action/:name', requireAuth, async (req, res) => {
    try {
      res.json({ ok: true, message: await runAction(req.params.name, req, client) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(resolve(PUBLIC_DIR, 'index.html')));

  const server = app.listen(web.port, '0.0.0.0', () => {
    log.info(`dashboard on port ${web.port}${baseUrl() ? ` — ${baseUrl()}` : ''}`);
    if (baseUrl()) {
      // Discord rejects anything that isn't a byte-for-byte match, so print the
      // exact string to paste into OAuth2 → Redirects rather than describing it.
      log.info(`OAuth redirect URI — paste this into Developer Portal → OAuth2 → Redirects:`);
      log.info(`    ${redirectUri()}`);
    } else {
      log.warn('DASHBOARD_URL not set and no Railway domain detected — login will fail until one exists');
    }
  });

  return () => server.close();
}

async function runAction(name, req, client) {
  const guild = client.guilds.cache.get(env.guildId);

  if (name === 'welcome-test') {
    const member = await guild.members.fetch(req.session.id).catch(() => null);
    if (!member) throw new Error('Could not find you in the server.');
    const message = await sendWelcome(member);
    if (!message) throw new Error('No welcome channel is set.');
    return `Posted in #${message.channel.name}.`;
  }

  if (name === 'notify-check') {
    const found = await runCheck(client);
    return found.length ? `Announced ${found.length} new post(s).` : 'Checked everything — nothing new.';
  }

  if (name === 'poll-create') {
    const { question, options: raw, hours, multi, channelId, pingRoleId } = req.body ?? {};
    if (!String(question ?? '').trim()) throw new Error('Give the poll a question.');

    const options = parseOptions(raw ?? '');
    if (options.length < 2) {
      throw new Error('A poll needs at least two options, separated by |');
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) throw new Error('Pick a channel to post in.');
    assertCanPost(channel, await guild.members.fetchMe());

    const message = await createPoll(channel, {
      question,
      options,
      hours: Number(hours) || 24,
      multi: Boolean(multi),
      mentionRoleId: pingRoleId || null,
      author: { id: req.session.id, tag: req.session.tag },
    });
    return `Poll posted in #${channel.name}.`;
  }

  if (name === 'poll-end') {
    const { message } = await endPoll(client, String(req.body?.messageId ?? ''));
    return `Closed. Results are on the poll in #${message.channel.name}.`;
  }

  if (name === 'notify-test') {
    const account = (config.notifications?.accounts ?? []).find((a) => a.id === req.body?.accountId);
    if (!account) throw new Error('Unknown account.');
    const posts = await getPlatform(account.platform).fetchLatest(account);
    if (!posts.length) throw new Error('That feed returned nothing (offline, or empty).');
    const latest = posts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];
    await announce(client, account, latest);
    return `Posted: ${latest.title}`;
  }

  throw new Error(`Unknown action "${name}".`);
}

/** Webhook URLs are credentials — never send them to the browser. */
function redact(settings) {
  const copy = JSON.parse(JSON.stringify(settings));
  for (const account of copy.notifications?.accounts ?? []) {
    if (account.webhookUrl) account.webhookUrl = WEBHOOK_MASK;
  }
  return copy;
}

/** …and a mask coming back means "unchanged", not "set it to dots". */
function unredact(patch, live) {
  if (!patch?.notifications?.accounts) return patch;
  for (const account of patch.notifications.accounts) {
    if (account.webhookUrl !== WEBHOOK_MASK) continue;
    const current = (live.notifications?.accounts ?? []).find((a) => a.id === account.id);
    account.webhookUrl = current?.webhookUrl ?? '';
  }
  return patch;
}

async function exchangeCode(code, redirectUri, clientSecret) {
  const res = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function discordGet(path, token) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  return res.json();
}

/** Shown instead of a blank 502 when the dashboard can't start. */
const setupHelpPage = (problems) => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard needs setting up</title>
<body style="font:16px/1.65 system-ui,-apple-system,sans-serif;background:#100E17;color:#EEEBF5;margin:0;padding:12vh 7vw;max-width:44rem">
  <h1 style="color:#A78BFA;font-size:1.7rem;margin:0 0 .4em">Almost there</h1>
  <p style="color:#B8B2C9;margin:0 0 1.6em">The bot is running — the dashboard just needs
  ${problems.length === 1 ? 'one more variable' : `${problems.length} more variables`}
  set on your host, then a redeploy.</p>
  ${problems
    .map(
      (p) => `<div style="background:#17151F;border:1px solid #262234;border-left:3px solid #A78BFA;border-radius:12px;padding:16px 20px;margin-bottom:14px">
        <code style="color:#C4B5FD;font-size:15px">${escapeHtml(p.name)}</code>
        <div style="color:#B8B2C9;font-size:14.5px;margin-top:6px">${escapeHtml(p.fix)}</div>
      </div>`
    )
    .join('')}
  <p style="color:#7D7691;font-size:14px;margin-top:2em">Everything else works without this page —
  the same settings are available in Discord with <code>/setup</code>.</p>
</body>`;

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const denied = (reason) =>
  `<!doctype html><meta charset="utf-8"><title>No access</title>
   <body style="font:16px/1.6 system-ui;background:#12111A;color:#EEEBF5;padding:15vh 8vw">
   <h1 style="color:#A78BFA">No access</h1><p>${reason}</p>
   <p><a style="color:#A78BFA" href="/login">Start again</a></p>`;

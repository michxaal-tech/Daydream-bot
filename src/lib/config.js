import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import 'dotenv/config';

const CONFIG_PATH = resolve(process.cwd(), 'config.json');

if (!existsSync(CONFIG_PATH)) {
  throw new Error('config.json not found — copy the one in the repo root and fill in your IDs.');
}

export const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

/** Adds the missing https://, drops a trailing slash, tolerates a stray path. */
function normalizeBaseUrl(raw) {
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return withScheme.replace(/\/+$/, '');
  }
}

export const env = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  pollSeconds: Number(process.env.POLL_INTERVAL_SECONDS ?? 300),
  seedOnFirstRun: (process.env.SEED_ON_FIRST_RUN ?? 'true') !== 'false',
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  xBearer: process.env.X_BEARER_TOKEN || '',
  nitterBase: (process.env.NITTER_BASE_URL || 'https://nitter.net').replace(/\/$/, ''),
  rsshubBase: (process.env.RSSHUB_BASE_URL || 'https://rsshub.app').replace(/\/$/, ''),
  twitchClientId: process.env.TWITCH_CLIENT_ID || '',
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  /**
   * Message Content is a privileged intent. Requesting one that isn't enabled
   * in the Developer Portal makes login fail outright, so this stays off until
   * you turn it on in both places. Automod's content rules need it; levels,
   * starboard and everything else do not.
   */
  messageContent: process.env.ENABLE_MESSAGE_CONTENT === 'true',
  /** Register slash commands on boot, so hosts with no terminal still work. */
  autoDeployCommands: (process.env.AUTO_DEPLOY_COMMANDS ?? 'true') !== 'false',
  /** Where the "already announced" store lives — point this at a mounted volume. */
  dataDir: process.env.DATA_DIR || 'data',

  web: {
    enabled: (process.env.DASHBOARD_ENABLED ?? 'true') !== 'false',
    port: Number(process.env.PORT ?? 3000),
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    /**
     * Public origin, e.g. https://daydream-bot.up.railway.app.
     * Normalised hard: a DASHBOARD_URL pasted without a scheme, or with a
     * trailing slash, silently breaks OAuth with an "invalid redirect_uri" that
     * points nowhere useful. Fix it here instead of making someone debug it.
     */
    baseUrl: normalizeBaseUrl(
      process.env.DASHBOARD_URL || process.env.RAILWAY_PUBLIC_DOMAIN || ''
    ),
  },
};

const NAMES = { token: 'DISCORD_TOKEN', clientId: 'DISCORD_CLIENT_ID' };

/** Fails fast with a readable message instead of a cryptic login error. */
export function assertEnv() {
  const missing = Object.keys(NAMES).filter((k) => !env[k]);
  if (!missing.length) return;

  // Hosted or local? The fix is in a completely different place, so say which.
  const hosted = Boolean(
    process.env.RAILWAY_ENVIRONMENT_NAME ||
      process.env.RENDER ||
      process.env.FLY_APP_NAME ||
      process.env.REPL_ID ||
      process.env.DYNO ||
      process.env.KUBERNETES_SERVICE_HOST
  );

  throw new Error(
    `Missing required env vars: ${missing.map((m) => NAMES[m]).join(', ')}.\n` +
      (hosted
        ? '  Set them on the service itself (Railway: your service → Variables → Raw Editor),\n' +
          '  then redeploy — variables added after a build started do not reach the running\n' +
          '  container. Project-level shared variables must be referenced by the service to apply.'
        : '  Copy .env.example to .env and fill it in.')
  );
}

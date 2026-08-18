import { WebhookClient } from 'discord.js';
import { config, env } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { hasSeen, markSeen, markSeenBulk, isSeeded, markSeeded } from '../../lib/store.js';
import { getPlatform } from './platforms/index.js';
import { renderAll } from './render.js';

const log = logger('notify');
const webhooks = new Map();

export function enabledAccounts() {
  return (config.notifications?.accounts ?? []).filter((a) => a.enabled !== false);
}

/** Poll every enabled account once and announce anything new. */
export async function runCheck(client, { only = null, force = false } = {}) {
  if (!config.notifications?.enabled && !force) return [];

  const accounts = enabledAccounts().filter((a) => !only || a.id === only);
  const announced = [];

  for (const account of accounts) {
    try {
      const posts = await getPlatform(account.platform).fetchLatest(account);
      if (!posts.length) continue;

      // Newest last, so a burst of uploads posts in chronological order.
      posts.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

      // First ever run: remember the backlog instead of dumping it in chat.
      if (env.seedOnFirstRun && !isSeeded(account.id) && !force) {
        markSeenBulk(account.id, posts.map((p) => p.id));
        markSeeded(account.id);
        log.info(`seeded ${account.id} with ${posts.length} existing post(s) — no announcement`);
        continue;
      }

      for (const post of posts) {
        if (!force && hasSeen(account.id, post.id)) continue;
        await announce(client, account, post);
        markSeen(account.id, post.id);
        announced.push({ account: account.id, post });
        if (force) break; // /notify test only ever posts one
      }
    } catch (err) {
      log.warn(`${account.id} (${account.platform}) check failed:`, err.message);
    }
  }

  if (announced.length) log.info(`announced ${announced.length} new post(s)`);
  return announced;
}

/** Send through a webhook when one is configured, otherwise as the bot. */
export async function announce(client, account, post, overrideChannelId = null) {
  const payload = renderAll(account, post);

  if (!overrideChannelId && account.webhookUrl) {
    let hook = webhooks.get(account.id);
    if (!hook) {
      hook = new WebhookClient({ url: account.webhookUrl });
      webhooks.set(account.id, hook);
    }
    return hook.send({
      ...payload,
      username: account.webhookName ?? `${config.brand?.name ?? 'Daydream'} Uploads`,
      avatarURL: account.webhookAvatar ?? undefined,
      allowedMentions: mentionPolicy(account),
    });
  }

  const channelId =
    overrideChannelId || account.postToChannelId || config.notifications?.defaultChannelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    throw new Error(`account ${account.id}: channel ${channelId} is missing or not text-based`);
  }

  const message = await channel.send({ ...payload, allowedMentions: mentionPolicy(account) });

  // Crossposting turns an announcement-channel post into a follower broadcast.
  if (account.crosspost && channel.type === 5 /* GuildAnnouncement */) {
    await message.crosspost().catch((e) => log.warn('crosspost failed:', e.message));
  }
  if (account.publishThread) {
    await message
      .startThread({ name: threadName(post), autoArchiveDuration: 1440 })
      .catch((e) => log.warn('thread failed:', e.message));
  }
  return message;
}

function threadName(post) {
  return `💬 ${String(post.title ?? 'New post').slice(0, 90)}`;
}

/** Only ping the role the account explicitly names — never accidental @everyone. */
function mentionPolicy(account) {
  if (account.mentionEveryone) return { parse: ['everyone', 'roles'] };
  return account.mentionRoleId ? { roles: [account.mentionRoleId] } : { parse: [] };
}

/** Kick off the polling loop; returns a stop() for graceful shutdown. */
export function startWatcher(client) {
  if (!config.notifications?.enabled) {
    log.info('notifications disabled in config.json — watcher not started');
    return () => {};
  }
  const seconds = Math.max(60, env.pollSeconds);
  log.info(`watching ${enabledAccounts().length} account(s) every ${seconds}s`);

  runCheck(client).catch((e) => log.error(e));
  const timer = setInterval(() => runCheck(client).catch((e) => log.error(e)), seconds * 1000);
  return () => clearInterval(timer);
}

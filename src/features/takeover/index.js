/**
 * Live takeover: when a stream starts, the server visibly changes — a channel
 * is renamed, a banner is pinned — and everything reverts when it ends. The
 * original names are stored so a restart mid-stream can still undo it.
 */
import { getIn, setIn, deleteIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed, COLORS } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('takeover');
const STATE = 'takeover';

export const isLive = () => Boolean(getIn(STATE, 'active'));

export async function start(client, post) {
  const cfg = config.liveTakeover ?? {};
  if (!cfg.enabled || isLive()) return false;

  const saved = { at: Date.now(), url: post.url, renamed: null, bannerId: null, bannerChannelId: null };

  if (/^\d{17,20}$/.test(cfg.renameChannelId ?? '')) {
    const channel = await client.channels.fetch(cfg.renameChannelId).catch(() => null);
    if (channel) {
      saved.renamed = { id: channel.id, was: channel.name };
      await channel.setName(cfg.liveName ?? '🔴-live-now', 'stream started').catch((e) => log.warn('rename failed:', e.message));
    }
  }

  if (/^\d{17,20}$/.test(cfg.bannerChannelId ?? '')) {
    const channel = await client.channels.fetch(cfg.bannerChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      const banner = await channel.send({
        embeds: [
          embed({ variant: 'deep' })
            .setTitle('🔴 Live right now')
            .setDescription(`**${post.title}**\n${post.url}`)
            .setColor(COLORS.deep),
        ],
      }).catch(() => null);
      if (banner) {
        await banner.pin().catch(() => {});
        saved.bannerId = banner.id;
        saved.bannerChannelId = channel.id;
      }
    }
  }

  setIn(STATE, 'active', saved);
  log.info('live takeover started');
  return true;
}

export async function end(client) {
  const saved = getIn(STATE, 'active');
  if (!saved) return false;

  if (saved.renamed) {
    const channel = await client.channels.fetch(saved.renamed.id).catch(() => null);
    await channel?.setName(saved.renamed.was, 'stream ended').catch(() => {});
  }
  if (saved.bannerId && saved.bannerChannelId) {
    const channel = await client.channels.fetch(saved.bannerChannelId).catch(() => null);
    const banner = await channel?.messages.fetch(saved.bannerId).catch(() => null);
    await banner?.unpin().catch(() => {});
    await banner?.delete().catch(() => {});
  }

  deleteIn(STATE, 'active');
  log.info('live takeover ended');
  return true;
}

/**
 * Called on every notification poll. The live platforms return nothing while
 * offline, which is exactly the signal to revert.
 */
export async function sync(client, { livePostsFound }) {
  const cfg = config.liveTakeover ?? {};
  if (!cfg.enabled) return;
  if (livePostsFound.length && !isLive()) return start(client, livePostsFound[0]);
  if (!livePostsFound.length && isLive()) return end(client);
}

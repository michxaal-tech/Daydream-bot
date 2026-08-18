/**
 * Per-channel automation: threads on every post, crossposting announcements,
 * a sticky message that stays at the bottom, auto-reactions, and slowmode that
 * raises itself when a channel spikes after an upload.
 */
import { ChannelType } from 'discord.js';
import { getIn, setIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { safeEmoji } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('channels');
const STICKY = 'stickyMessages';
const rates = new Map();

const rulesFor = (channelId) =>
  (config.channelRules ?? []).find((r) => r.channelId === channelId) ?? null;

/** Messages seen in this channel in the last minute. */
export function messageRate(channelId, now = Date.now(), memory = rates) {
  const window = (memory.get(channelId) ?? []).filter((t) => now - t < 60_000);
  window.push(now);
  memory.set(channelId, window);
  return window.length;
}

/** Which slowmode a rate deserves. Returns null when nothing should change. */
export function slowmodeFor(rate, cfg, currentSeconds) {
  if (!cfg?.autoSlowmode) return null;
  const trigger = cfg.slowmodeAt ?? 20;
  const seconds = cfg.slowmodeSeconds ?? 10;
  if (rate >= trigger && currentSeconds < seconds) return seconds;
  if (rate < Math.floor(trigger / 2) && currentSeconds === seconds) return 0;
  return null;
}

export async function handleMessage(message) {
  const rules = rulesFor(message.channelId);
  if (!rules) return;

  if (rules.autoThread && !message.hasThread) {
    const name = (message.content?.slice(0, 80) || `Thread · ${message.author.username}`).trim();
    await message.startThread({ name, autoArchiveDuration: 1440 })
      .catch((err) => log.warn('auto-thread failed:', err.message));
  }

  if (rules.autoPublish && message.channel.type === ChannelType.GuildAnnouncement) {
    await message.crosspost().catch(() => {});
  }

  for (const raw of rules.autoReact ?? []) {
    const emoji = safeEmoji(raw);
    if (emoji) await message.react(emoji).catch(() => {});
  }

  if (rules.autoSlowmode) {
    const next = slowmodeFor(messageRate(message.channelId), rules, message.channel.rateLimitPerUser ?? 0);
    if (next !== null) {
      await message.channel.setRateLimitPerUser(next, 'slowmode autopilot')
        .then(() => log.info(`#${message.channel.name} slowmode → ${next}s`))
        .catch(() => {});
    }
  }

  if (rules.sticky) await bumpSticky(message.channel, rules.sticky);
}

/**
 * Keep a message pinned to the bottom by deleting and re-posting it, but only
 * after a gap — otherwise every message in a busy channel triggers a rewrite.
 */
async function bumpSticky(channel, text) {
  const state = getIn(STICKY, channel.id, { messageId: null, at: 0 });
  if (Date.now() - state.at < 10_000) return;

  if (state.messageId) {
    await channel.messages.fetch(state.messageId).then((m) => m.delete()).catch(() => {});
  }
  const posted = await channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => null);
  if (posted) setIn(STICKY, channel.id, { messageId: posted.id, at: Date.now() });
}

/* ── join-to-create voice channels ─────────────────────────────────────── */

const TEMP = 'tempVoice';

export async function handleVoice(oldState, newState) {
  const cfg = config.tempVoice ?? {};
  const client = newState.client ?? oldState.client;

  // left a temporary room — bin it once it's empty
  if (oldState.channel && getIn(TEMP, oldState.channelId) && oldState.channel.members.size === 0) {
    await oldState.channel.delete('temporary voice channel empty').catch(() => {});
    setIn(TEMP, oldState.channelId, null);
  }

  if (!cfg.enabled || newState.channelId !== cfg.lobbyChannelId) return;

  const guild = newState.guild;
  const room = await guild.channels.create({
    name: (cfg.nameTemplate ?? "{user}'s room").replace('{user}', newState.member.displayName),
    type: ChannelType.GuildVoice,
    parent: newState.channel?.parentId ?? null,
    userLimit: cfg.userLimit ?? 0,
  }).catch((err) => {
    log.warn('temp voice create failed:', err.message);
    return null;
  });
  if (!room) return;

  setIn(TEMP, room.id, { ownerId: newState.id, at: Date.now() });
  await newState.member.voice.setChannel(room).catch(() => {});
}

/* ── counter channels ──────────────────────────────────────────────────── */

/**
 * Renames a voice channel to show a live number. Discord rate-limits channel
 * renames hard (2 per 10 minutes), so this runs on a slow timer, not on events.
 */
export async function updateCounters(client) {
  const counters = config.counterChannels ?? [];
  for (const counter of counters) {
    if (!/^\d{17,20}$/.test(counter.channelId ?? '')) continue;
    const channel = await client.channels.fetch(counter.channelId).catch(() => null);
    if (!channel) continue;

    const value =
      counter.type === 'members' ? channel.guild.memberCount
      : counter.type === 'online' ? channel.guild.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size
      : counter.type === 'boosts' ? channel.guild.premiumSubscriptionCount ?? 0
      : null;
    if (value === null) continue;

    const name = (counter.template ?? '{value} members').replace('{value}', value.toLocaleString());
    if (channel.name !== name) {
      await channel.setName(name, 'counter channel').catch(() => {});
    }
  }
}

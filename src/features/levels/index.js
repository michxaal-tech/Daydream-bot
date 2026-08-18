/**
 * XP and levels.
 *
 * A message earns XP at most once per cooldown window, so spamming can't farm
 * it. The curve is the familiar 5x² + 50x + 100 per level — people already have
 * an intuition for how fast that feels, and it slows at about the right rate
 * for a chat server.
 */
import { collection, getIn, setIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('levels');
const COLLECTION = 'xp';

export const xpToClear = (level) => 5 * level ** 2 + 50 * level + 100;

/** Total XP needed to reach a level from zero. */
export function totalXpFor(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpToClear(i);
  return total;
}

export function levelFromXp(xp) {
  let level = 0;
  let remaining = xp;
  while (remaining >= xpToClear(level)) {
    remaining -= xpToClear(level);
    level++;
  }
  return { level, into: remaining, needed: xpToClear(level) };
}

export const getMember = (userId) => getIn(COLLECTION, userId, { xp: 0, messages: 0, lastAt: 0 });
export const setMember = (userId, record) => setIn(COLLECTION, userId, record);

/**
 * Award XP for a message. Returns the new level if the member just levelled up,
 * otherwise null — the caller decides whether to announce.
 */
export function awardForMessage(userId, { now = Date.now(), roll = Math.random } = {}) {
  const cfg = config.levels ?? {};
  const cooldownMs = (cfg.cooldownSeconds ?? 60) * 1000;
  const min = cfg.minPerMessage ?? 15;
  const max = Math.max(min, cfg.maxPerMessage ?? 25);

  const before = getMember(userId);
  if (now - before.lastAt < cooldownMs) {
    setMember(userId, { ...before, messages: before.messages + 1 });
    return null;
  }

  const gain = min + Math.floor(roll() * (max - min + 1));
  const after = { xp: before.xp + gain, messages: before.messages + 1, lastAt: now };
  setMember(userId, after);

  const was = levelFromXp(before.xp).level;
  const is = levelFromXp(after.xp).level;
  return is > was ? is : null;
}

const validRole = (id) => /^\d{17,20}$/.test(id);

/** Roles granted exactly at this level, from `levels.rewards`: { "5": roleId }. */
export function rewardsFor(level) {
  return Object.entries(config.levels?.rewards ?? {})
    .filter(([at]) => Number(at) === level)
    .map(([, roleId]) => roleId)
    .filter(validRole);
}

/** Every reward earned up to a level — used to repair roles after a gap. */
export function allRewardsUpTo(level) {
  return Object.entries(config.levels?.rewards ?? {})
    .filter(([at]) => Number(at) <= level)
    .map(([, roleId]) => roleId)
    .filter(validRole);
}

export function leaderboard(limit = 10) {
  return Object.entries(collection(COLLECTION))
    .map(([userId, record]) => ({ userId, ...record, ...levelFromXp(record.xp) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

export function rankOf(userId) {
  const sorted = Object.entries(collection(COLLECTION)).sort((a, b) => b[1].xp - a[1].xp);
  const index = sorted.findIndex(([id]) => id === userId);
  return { rank: index === -1 ? null : index + 1, of: sorted.length };
}

export const resetMember = (userId) => setMember(userId, { xp: 0, messages: 0, lastAt: 0 });

export function levelUpEmbed(member, level) {
  return embed()
    .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
    .setTitle(`Level ${level} 🎉`)
    .setDescription(
      (config.levels?.announceTemplate ?? '{user} just hit **level {level}**')
        .replaceAll('{user}', `<@${member.id}>`)
        .replaceAll('{level}', String(level))
        .replaceAll('{name}', member.displayName ?? member.user.username)
    );
}

/* ── voice xp ────────────────────────────────────────────────────────────
   Time in a voice channel earns XP too, on the same curve. Muted-and-alone
   doesn't count, or people would idle in an empty room overnight for it.   */
const voiceSince = new Map();

export function voiceJoined(userId, at = Date.now()) {
  voiceSince.set(userId, at);
}

/** Returns the XP awarded, or 0. */
export function voiceLeft(userId, { at = Date.now(), channelSize = 2 } = {}) {
  const cfg = config.levels ?? {};
  const since = voiceSince.get(userId);
  voiceSince.delete(userId);
  if (!cfg.enabled || !cfg.voiceXp || !since) return 0;
  if (channelSize < 2) return 0; // alone in a room is not participation

  const minutes = Math.floor((at - since) / 60_000);
  if (minutes < 1) return 0;
  const gain = Math.min(minutes, cfg.voiceMaxMinutes ?? 120) * (cfg.voicePerMinute ?? 2);

  const before = getMember(userId);
  setMember(userId, { ...before, xp: before.xp + gain });
  return gain;
}

export async function handleMessage(message) {
  const cfg = config.levels ?? {};
  if (!cfg.enabled) return;
  if (message.author.bot || !message.guild) return;
  if ((cfg.ignoredChannelIds ?? []).includes(message.channelId)) return;

  const level = awardForMessage(message.author.id);
  if (level === null) return;

  const roles = rewardsFor(level);
  if (roles.length) {
    await message.member?.roles
      .add(roles, `level ${level} reward`)
      .catch((err) => log.warn(`level reward failed for ${message.author.tag}:`, err.message));
  }

  if (cfg.announce === false) return;
  const channel = cfg.announceChannelId
    ? await message.client.channels.fetch(cfg.announceChannelId).catch(() => null)
    : message.channel;
  await channel
    ?.send({ embeds: [levelUpEmbed(message.member, level)], allowedMentions: { users: [message.author.id] } })
    .catch((err) => log.warn('level-up announce failed:', err.message));
}

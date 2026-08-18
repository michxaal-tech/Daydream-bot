/**
 * Per-member odds and ends: birthdays, AFK notices, and sticky roles that
 * survive someone leaving and coming back.
 */
import { collection, getIn, setIn, deleteIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('profiles');
const BIRTHDAYS = 'birthdays';
const AFK = 'afk';
const STICKY = 'stickyRoles';

/* ── birthdays ─────────────────────────────────────────────────────────── */

/** Stored as MM-DD, so no year and no age. */
export function setBirthday(userId, month, day) {
  const safe = new Date(Date.UTC(2024, month - 1, day)); // leap year, so 29 Feb is valid
  if (safe.getUTCMonth() !== month - 1 || safe.getUTCDate() !== day) {
    throw new Error("That date doesn't exist.");
  }
  const value = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  setIn(BIRTHDAYS, userId, value);
  return value;
}

export const removeBirthday = (userId) => deleteIn(BIRTHDAYS, userId);
export const getBirthday = (userId) => getIn(BIRTHDAYS, userId);

export const birthdaysOn = (date = new Date()) => {
  const key = `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return Object.entries(collection(BIRTHDAYS)).filter(([, value]) => value === key).map(([userId]) => userId);
};

export function upcomingBirthdays(limit = 10, from = new Date()) {
  const today = from.getUTCMonth() * 31 + from.getUTCDate();
  return Object.entries(collection(BIRTHDAYS))
    .map(([userId, value]) => {
      const [m, d] = value.split('-').map(Number);
      const ord = (m - 1) * 31 + d;
      return { userId, value, distance: ord >= today ? ord - today : ord - today + 372 };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/** Runs once a day; the marker stops a restart re-announcing the same date. */
export async function announceBirthdays(client) {
  const cfg = config.birthdays ?? {};
  if (!cfg.enabled || !/^\d{17,20}$/.test(cfg.channelId ?? '')) return 0;

  const today = new Date().toISOString().slice(0, 10);
  if (getIn('meta-birthday', 'lastRun') === today) return 0;
  setIn('meta-birthday', 'lastRun', today);

  const ids = birthdaysOn();
  if (!ids.length) return 0;

  const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel?.isTextBased()) return 0;

  await channel.send({
    content: ids.map((id) => `<@${id}>`).join(' '),
    embeds: [embed().setTitle('🎂 Birthday').setDescription(
      (cfg.template ?? "It's {users}' birthday today — say something nice.").replace('{users}', ids.map((id) => `<@${id}>`).join(', '))
    )],
    allowedMentions: { users: ids },
  }).catch((err) => log.warn('birthday announce failed:', err.message));

  if (/^\d{17,20}$/.test(cfg.roleId ?? '')) {
    const guild = channel.guild;
    for (const id of ids) {
      await guild.members.fetch(id).then((m) => m.roles.add(cfg.roleId, 'birthday')).catch(() => {});
    }
  }
  return ids.length;
}

/** Strip yesterday's birthday role. Called on the same daily tick. */
export async function clearBirthdayRoles(client) {
  const cfg = config.birthdays ?? {};
  if (!/^\d{17,20}$/.test(cfg.roleId ?? '')) return;
  const todays = new Set(birthdaysOn());
  for (const guild of client.guilds.cache.values()) {
    const role = guild.roles.cache.get(cfg.roleId);
    if (!role) continue;
    for (const member of role.members.values()) {
      if (!todays.has(member.id)) await member.roles.remove(cfg.roleId, 'birthday over').catch(() => {});
    }
  }
}

/* ── afk ───────────────────────────────────────────────────────────────── */

export const setAfk = (userId, reason) => setIn(AFK, userId, { reason: reason || 'away', since: Date.now() });
export const getAfk = (userId) => getIn(AFK, userId);
export const clearAfk = (userId) => deleteIn(AFK, userId);

/** Returns lines to post: a welcome-back, and a notice per AFK person mentioned. */
export function afkNotices(message) {
  if (!config.afk?.enabled) return { back: null, mentioned: [] };
  const lines = { back: null, mentioned: [] };

  const own = getAfk(message.author.id);
  if (own) {
    clearAfk(message.author.id);
    lines.back = `Welcome back <@${message.author.id}> — AFK cleared.`;
  }

  for (const user of message.mentions?.users?.values?.() ?? []) {
    const afk = getAfk(user.id);
    if (afk) lines.mentioned.push(`**${user.username}** is AFK: ${afk.reason} — <t:${Math.floor(afk.since / 1000)}:R>`);
  }
  return lines;
}

/* ── sticky roles ──────────────────────────────────────────────────────── */

/** Remember a leaver's roles so a rejoin doesn't cost them their progress. */
export function rememberRoles(member) {
  if (!config.stickyRoles?.enabled) return;
  const ids = member.roles?.cache
    ?.filter((r) => r.id !== member.guild.id && !r.managed)
    ?.map((r) => r.id) ?? [];
  if (ids.length) setIn(STICKY, member.id, ids);
}

export async function restoreRoles(member) {
  if (!config.stickyRoles?.enabled) return [];
  const saved = getIn(STICKY, member.id, []);
  if (!saved.length) return [];

  const me = await member.guild.members.fetchMe();
  const grantable = saved.filter((id) => {
    const role = member.guild.roles.cache.get(id);
    return role && role.position < me.roles.highest.position;
  });
  if (grantable.length) {
    await member.roles.add(grantable, 'sticky roles').catch((e) => log.warn('sticky roles failed:', e.message));
  }
  deleteIn(STICKY, member.id);
  return grantable;
}

/**
 * The punishment toolkit, modelled on what bleed offers: jail, three kinds of
 * mute, temp/soft/hard bans, forced nicknames and staff stripping — plus the
 * setup that creates the roles and channel overwrites those need.
 *
 * Everything routes through the same case log as the rest of moderation, so a
 * jail and a warn read the same way in the record.
 */
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { collection, getIn, setIn, deleteIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { updateSettings } from '../../lib/settings.js';
import { logger } from '../../lib/logger.js';

const log = logger('punish');
const JAILED = 'jailedRoles';
const HARDBANS = 'hardBans';
const FORCED = 'forcedNicks';
const TEMPBANS = 'tempBans';
const timers = new Map();

export const MUTE_KINDS = {
  text: { key: 'mutedRoleId', name: 'Muted', deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads], label: 'text mute' },
  image: { key: 'imageMutedRoleId', name: 'Image Muted', deny: [PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks], label: 'image mute' },
  reaction: { key: 'reactionMutedRoleId', name: 'Reaction Muted', deny: [PermissionFlagsBits.AddReactions], label: 'reaction mute' },
};

const cfg = () => config.punishments ?? {};
const isId = (v) => /^\d{17,20}$/.test(v ?? '');

/* ── setup ─────────────────────────────────────────────────────────────── */

/** Creates the case-log channel, the jail role and a jail channel only it can see. */
export async function setupJail(guild, { who } = {}) {
  const created = [];
  const current = cfg();

  let role = isId(current.jailRoleId) ? guild.roles.cache.get(current.jailRoleId) : null;
  if (!role) {
    role = await guild.roles.create({ name: 'Jailed', color: 0x36393f, reason: 'moderation setup' });
    created.push(`role **${role.name}**`);
  }

  let channel = isId(current.jailChannelId) ? guild.channels.cache.get(current.jailChannelId) : null;
  if (!channel) {
    channel = await guild.channels.create({
      name: 'jail',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
      reason: 'moderation setup',
    });
    created.push(`channel **#${channel.name}**`);
  }

  // The jail role must be denied everywhere else, or "jailed" means nothing.
  let touched = 0;
  for (const ch of guild.channels.cache.values()) {
    if (ch.id === channel.id || !ch.permissionOverwrites) continue;
    await ch.permissionOverwrites.edit(role, { ViewChannel: false }, { reason: 'jail setup' })
      .then(() => touched++)
      .catch(() => {});
  }

  updateSettings({ punishments: { jailRoleId: role.id, jailChannelId: channel.id } }, { who });
  return { created, touched, roleId: role.id, channelId: channel.id };
}

/** Creates the three mute roles and denies each one what it should deny. */
export async function setupMutes(guild, { who } = {}) {
  const patch = {};
  const created = [];
  let touched = 0;

  for (const [kind, spec] of Object.entries(MUTE_KINDS)) {
    let role = isId(cfg()[spec.key]) ? guild.roles.cache.get(cfg()[spec.key]) : null;
    if (!role) {
      role = await guild.roles.create({ name: spec.name, color: 0x36393f, reason: 'mute setup' });
      created.push(`**${spec.name}**`);
    }
    patch[spec.key] = role.id;

    for (const ch of guild.channels.cache.values()) {
      if (!ch.permissionOverwrites) continue;
      const deny = Object.fromEntries(
        spec.deny.map((flag) => [Object.keys(PermissionFlagsBits).find((k) => PermissionFlagsBits[k] === flag), false])
      );
      await ch.permissionOverwrites.edit(role, deny, { reason: `${kind} mute setup` })
        .then(() => touched++)
        .catch(() => {});
    }
  }

  updateSettings({ punishments: patch }, { who });
  return { created, touched };
}

/* ── jail ──────────────────────────────────────────────────────────────── */

/**
 * Takes every role off the member and gives them the jail role, remembering
 * what they had so unjailing puts them back exactly as they were.
 */
export async function jail(member, { reason = 'jailed' } = {}) {
  const roleId = cfg().jailRoleId;
  if (!isId(roleId)) throw new Error('No jail role — run `/modsetup jail` first.');

  const me = await member.guild.members.fetchMe();
  const previous = member.roles.cache
    .filter((r) => r.id !== member.guild.id && !r.managed && r.position < me.roles.highest.position)
    .map((r) => r.id);

  setIn(JAILED, member.id, previous);
  if (previous.length) await member.roles.remove(previous, reason).catch(() => {});
  await member.roles.add(roleId, reason);
  return { removed: previous.length, channelId: cfg().jailChannelId };
}

export async function unjail(member, { reason = 'released' } = {}) {
  const roleId = cfg().jailRoleId;
  const previous = getIn(JAILED, member.id, []);

  if (isId(roleId)) await member.roles.remove(roleId, reason).catch(() => {});
  if (previous.length) await member.roles.add(previous, reason).catch(() => {});
  deleteIn(JAILED, member.id);
  return previous.length;
}

export const isJailed = (userId) => Boolean(getIn(JAILED, userId));

/* ── mutes ─────────────────────────────────────────────────────────────── */

export async function setMute(member, kind, on, { reason = 'mute' } = {}) {
  const spec = MUTE_KINDS[kind];
  if (!spec) throw new Error(`Unknown mute type "${kind}".`);
  const roleId = cfg()[spec.key];
  if (!isId(roleId)) throw new Error(`No ${spec.label} role — run \`/modsetup mutes\` first.`);

  if (on) await member.roles.add(roleId, reason);
  else await member.roles.remove(roleId, reason);
  return spec.label;
}

/* ── bans ──────────────────────────────────────────────────────────────── */

/** Ban then immediately unban — the standard way to purge someone's messages. */
export async function softban(guild, userId, { reason = 'softban', days = 1 } = {}) {
  await guild.members.ban(userId, { reason, deleteMessageSeconds: Math.min(7, days) * 86_400 });
  await guild.members.unban(userId, `softban release — ${reason}`);
}

/** A ban that survives an unban by someone else: rejoins get re-banned. */
export async function hardban(guild, userId, { reason = 'hardban', by } = {}) {
  setIn(HARDBANS, userId, { at: Date.now(), reason, by: by ?? null });
  await guild.members.ban(userId, { reason: `HARDBAN — ${reason}` });
}

export function unhardban(userId) {
  const had = Boolean(getIn(HARDBANS, userId));
  deleteIn(HARDBANS, userId);
  return had;
}

export const isHardBanned = (userId) => Boolean(getIn(HARDBANS, userId));
export const hardBans = () => Object.entries(collection(HARDBANS)).map(([userId, v]) => ({ userId, ...v }));

export async function tempban(guild, userId, { minutes, reason = 'tempban', deleteDays = 0 }) {
  const until = Date.now() + minutes * 60_000;
  setIn(TEMPBANS, userId, { until, reason, guildId: guild.id });
  await guild.members.ban(userId, { reason: `${reason} (until <t:${Math.floor(until / 1000)}:f>)`, deleteMessageSeconds: deleteDays * 86_400 });
  scheduleUnban(guild.client, userId, until);
  return until;
}

function scheduleUnban(client, userId, until) {
  const delay = until - Date.now();
  if (delay > 2_147_483_647) return; // re-armed on the next boot
  const timer = setTimeout(() => liftTempban(client, userId), Math.max(0, delay));
  timer.unref?.();
  timers.set(userId, timer);
}

export async function liftTempban(client, userId) {
  const record = getIn(TEMPBANS, userId);
  if (!record) return false;
  deleteIn(TEMPBANS, userId);
  clearTimeout(timers.get(userId));
  timers.delete(userId);

  const guild = client.guilds.cache.get(record.guildId);
  await guild?.members.unban(userId, 'temporary ban expired').catch(() => {});
  log.info(`tempban lifted for ${userId}`);
  return true;
}

export const tempbans = () => Object.entries(collection(TEMPBANS)).map(([userId, v]) => ({ userId, ...v }));

export function restoreTempbans(client) {
  const all = tempbans();
  for (const record of all) scheduleUnban(client, record.userId, record.until);
  if (all.length) log.info(`re-armed ${all.length} temporary ban(s)`);
}

/* ── forced nicknames & staff stripping ────────────────────────────────── */

export async function forceNick(member, nickname) {
  setIn(FORCED, member.id, nickname);
  await member.setNickname(nickname, 'forced nickname');
  return nickname;
}

export function releaseNick(userId) {
  const had = getIn(FORCED, userId);
  deleteIn(FORCED, userId);
  return had;
}

export const forcedNick = (userId) => getIn(FORCED, userId);

/** Put a forced nickname back if the member changes it. */
export async function enforceNick(member) {
  const forced = forcedNick(member.id);
  if (!forced || member.nickname === forced) return false;
  await member.setNickname(forced, 'forced nickname re-applied').catch(() => {});
  return true;
}

/** Remove every role carrying a dangerous permission — for a compromised mod. */
export async function stripStaff(member, { reason = 'staff stripped' } = {}) {
  const dangerous = [
    PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages,
  ];
  const me = await member.guild.members.fetchMe();
  const toRemove = member.roles.cache.filter(
    (role) => !role.managed && role.position < me.roles.highest.position && dangerous.some((flag) => role.permissions.has(flag))
  );
  if (toRemove.size) await member.roles.remove([...toRemove.keys()], reason);
  return [...toRemove.values()].map((r) => r.name);
}

/* ── staff binding & message customisation ─────────────────────────────── */

export const staffRoles = () => cfg().staffRoleIds ?? [];

export function isStaff(member) {
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  return staffRoles().some((id) => member.roles?.cache?.has(id));
}

/**
 * bleed's `invoke`: per-action wording for the channel reply and the DM.
 * {user} {moderator} {reason} {duration} are filled in.
 */
export function renderInvoke(action, kind, tokens) {
  const templates = cfg().invoke?.[action] ?? {};
  const template = templates[kind];
  if (!template) return null;
  return Object.entries(tokens).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value ?? '')),
    template
  );
}

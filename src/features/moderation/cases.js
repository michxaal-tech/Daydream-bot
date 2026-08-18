/**
 * The moderation record: one numbered case per action, and the mod-log post
 * that goes with it. Case numbers are what make a warning history usable —
 * "case 14" is something a mod can refer to a week later.
 */
import { collection, setIn, nextId } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed, COLORS } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('mod');
const COLLECTION = 'cases';

export const ACTIONS = {
  warn: { label: 'Warning', emoji: '⚠️' },
  timeout: { label: 'Timeout', emoji: '🔇' },
  untimeout: { label: 'Timeout lifted', emoji: '🔊' },
  kick: { label: 'Kick', emoji: '👢' },
  ban: { label: 'Ban', emoji: '🔨' },
  unban: { label: 'Unban', emoji: '🕊️' },
  automod: { label: 'Automod', emoji: '🤖' },
};

export function record({ action, userId, userTag, moderatorId, moderatorTag, reason, duration }) {
  const id = nextId('case');
  const entry = {
    id, action, userId, userTag,
    moderatorId: moderatorId ?? null,
    moderatorTag: moderatorTag ?? 'automod',
    reason: reason || 'No reason given',
    duration: duration ?? null,
    at: Date.now(),
  };
  setIn(COLLECTION, String(id), entry);
  return entry;
}

export const allCases = () => Object.values(collection(COLLECTION)).sort((a, b) => b.id - a.id);
export const casesFor = (userId) => allCases().filter((c) => c.userId === userId);
export const getCase = (id) => collection(COLLECTION)[String(id)] ?? null;

/** How many active warnings a member has — drives the escalation ladder. */
export const warningCount = (userId) =>
  casesFor(userId).filter((c) => c.action === 'warn' || c.action === 'automod').length;

export function caseEmbed(entry) {
  const meta = ACTIONS[entry.action] ?? { label: entry.action, emoji: '•' };
  const e = embed()
    .setTitle(`${meta.emoji} ${meta.label} · case #${entry.id}`)
    .addFields(
      { name: 'Member', value: `<@${entry.userId}>\n\`${entry.userTag}\``, inline: true },
      { name: 'Moderator', value: entry.moderatorId ? `<@${entry.moderatorId}>` : 'Automod', inline: true },
      { name: 'Reason', value: entry.reason }
    )
    .setTimestamp(new Date(entry.at));
  if (entry.duration) e.addFields({ name: 'Duration', value: entry.duration, inline: true });
  if (entry.action === 'ban' || entry.action === 'kick') e.setColor(COLORS.deep);
  return e;
}

/** Post to the mod-log channel, if one is configured. Never throws. */
export async function postToModLog(client, entry) {
  const channelId = config.moderation?.modLogChannelId;
  if (!channelId || !/^\d{17,20}$/.test(channelId)) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    log.warn(`mod-log channel ${channelId} is missing or not text-based`);
    return null;
  }
  return channel.send({ embeds: [caseEmbed(entry)], allowedMentions: { parse: [] } }).catch((err) => {
    log.warn('mod-log post failed:', err.message);
    return null;
  });
}

/** Record + log in one call — every moderation path should go through this. */
export async function logAction(client, details) {
  const entry = record(details);
  await postToModLog(client, entry);
  log.info(`case #${entry.id} ${entry.action} ${entry.userTag} by ${entry.moderatorTag}`);
  return entry;
}

/**
 * First-hour club: react to an upload announcement within the window and you
 * get the role. Creates a genuine race to be early, and hands the creator a
 * list of the people who reliably show up first.
 */
import { getIn, setIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { recordEngagement, recentUploads } from '../analytics/index.js';
import { logger } from '../../lib/logger.js';

const log = logger('firsthour');
const CLAIMED = 'firstHourClaims';

/** Is this message an upload announcement still inside its window? */
export function withinWindow(messageId, { now = Date.now(), uploads = recentUploads(50), cfg = config.firstHour ?? {} } = {}) {
  const upload = uploads.find((u) => u.messageId === messageId);
  if (!upload) return null;
  const window = (cfg.windowMinutes ?? 60) * 60_000;
  return now - upload.at <= window ? upload : null;
}

export async function handleReaction(reaction, user) {
  const cfg = config.firstHour ?? {};
  if (!cfg.enabled || user.bot) return;
  if (!/^\d{17,20}$/.test(cfg.roleId ?? '')) return;

  const upload = withinWindow(reaction.message.id);
  if (!upload) return;

  // One claim per member per upload, so spamming reactions earns nothing extra.
  const key = `${upload.messageId}:${user.id}`;
  if (getIn(CLAIMED, key)) return;
  setIn(CLAIMED, key, Date.now());

  recordEngagement(user.id, 'firstHour');

  const guild = reaction.message.guild;
  const member = await guild?.members.fetch(user.id).catch(() => null);
  if (!member) return;

  await member.roles.add(cfg.roleId, 'first hour club').catch((err) => log.warn('role failed:', err.message));

  if (cfg.announce && reaction.message.channel) {
    await reaction.message.channel
      .send({ content: `⚡ <@${user.id}> made the first hour.`, allowedMentions: { users: [user.id] } })
      .catch(() => {});
  }
}

/** Strip the role before the next upload, so it always means "this drop". */
export async function resetClub(guild) {
  const cfg = config.firstHour ?? {};
  if (!cfg.enabled || !cfg.resetEachUpload) return 0;
  const role = guild.roles.cache.get(cfg.roleId);
  if (!role) return 0;

  let removed = 0;
  for (const member of role.members.values()) {
    await member.roles.remove(role, 'new upload — first hour reset').catch(() => {});
    removed++;
  }
  return removed;
}

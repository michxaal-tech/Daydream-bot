/**
 * The Sunday digest. Everything in it comes from data the bot already holds,
 * so it costs one embed and makes a quiet week still feel like something
 * happened.
 */
import { getIn, setIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';
import { recentUploads, recentJoins, attribution, bestSlots, superfans, messagesPerHour } from './index.js';
import { leaderboard } from '../levels/index.js';
import { allCases } from '../moderation/cases.js';

const log = logger('recap');
const WEEK = 7 * 86_400_000;

/** Build the digest for the last seven days. Pure, so it can be previewed. */
export function buildRecap({ now = Date.now(), guildName = 'the server' } = {}) {
  const since = now - WEEK;
  const uploads = recentUploads(60).filter((u) => u.at >= since);
  const joins = recentJoins(800).filter((j) => j.at >= since);
  const cases = allCases().filter((c) => c.at >= since);
  const attributed = attribution({ uploads }).sort((a, b) => b.joins - a.joins);
  const messages = messagesPerHour(24 * 7).reduce((sum, point) => sum + point.value, 0);
  const fans = superfans(Object.fromEntries(leaderboard(50).map((r) => [r.userId, { xp: r.xp }])), 3);

  const lines = [];
  if (uploads.length) {
    lines.push(
      `**${uploads.length} drop${uploads.length === 1 ? '' : 's'}**`,
      ...attributed.slice(0, 4).map((u) => `• [${u.title.slice(0, 60)}](${u.url}) — ${u.joins} join${u.joins === 1 ? '' : 's'} after`)
    );
  }

  const e = embed()
    .setTitle(`📅 This week in ${guildName}`)
    .setDescription(lines.length ? lines.join('\n') : 'No uploads this week — quiet one.')
    .addFields(
      { name: 'New members', value: String(joins.length), inline: true },
      { name: 'Messages', value: messages.toLocaleString(), inline: true },
      { name: 'Mod actions', value: String(cases.length), inline: true }
    );

  if (fans.length) {
    e.addFields({
      name: 'Most invested',
      value: fans.map((f, i) => `${['🥇', '🥈', '🥉'][i]} <@${f.userId}> — ${f.score} pts`).join('\n'),
    });
  }

  const slots = bestSlots(undefined, 2);
  if (slots.length) {
    e.addFields({ name: 'Busiest hours', value: slots.map((s) => `${s.label} — ${s.value} messages`).join('\n') });
  }
  return e;
}

/** Posts at most once per calendar week, on the configured weekday. */
export async function maybePostRecap(client, { now = new Date() } = {}) {
  const cfg = config.recap ?? {};
  if (!cfg.enabled || !/^\d{17,20}$/.test(cfg.channelId ?? '')) return false;
  if (now.getUTCDay() !== (cfg.weekday ?? 0)) return false;

  const stamp = now.toISOString().slice(0, 10);
  if (getIn('meta-recap', 'lastRun') === stamp) return false;
  setIn('meta-recap', 'lastRun', stamp);

  const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel?.isTextBased()) return false;

  await channel.send({
    embeds: [buildRecap({ now: now.getTime(), guildName: channel.guild?.name ?? 'the server' })],
    allowedMentions: { parse: [] },
  }).catch((err) => log.warn('recap post failed:', err.message));

  log.info('weekly recap posted');
  return true;
}

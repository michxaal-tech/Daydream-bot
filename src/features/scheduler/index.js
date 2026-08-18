/**
 * Scheduled and recurring posts: reminders the server sends itself. Covers a
 * content calendar ("new video Friday 6pm"), a daily prompt, and anything else
 * worth saying on a timer.
 */
import { collection, getIn, setIn, deleteIn, nextId } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('scheduler');
const COLLECTION = 'scheduled';

export const REPEATS = { once: 0, daily: 86_400_000, weekly: 604_800_000 };

export function create({ channelId, text, at, repeat = 'once', authorTag, asEmbed = false, title = '' }) {
  const id = String(nextId('scheduled'));
  const entry = { id, channelId, text, at, repeat, authorTag, asEmbed, title, lastRun: null };
  setIn(COLLECTION, id, entry);
  return entry;
}

export const all = () => Object.values(collection(COLLECTION)).sort((a, b) => a.at - b.at);
export const remove = (id) => deleteIn(COLLECTION, String(id));

/** Everything due now. Recurring entries roll forward, one-offs are removed. */
export function due(now = Date.now()) {
  return all().filter((entry) => entry.at <= now);
}

export function advance(entry, now = Date.now()) {
  const step = REPEATS[entry.repeat] ?? 0;
  if (!step) {
    remove(entry.id);
    return null;
  }
  // Skip past any occurrences missed while the bot was down, rather than
  // firing a week's worth of dailies in one go on restart.
  let next = entry.at + step;
  while (next <= now) next += step;
  const updated = { ...entry, at: next, lastRun: now };
  setIn(COLLECTION, entry.id, updated);
  return updated;
}

export async function runDue(client, { now = Date.now() } = {}) {
  const ready = due(now);
  for (const entry of ready) {
    const channel = await client.channels.fetch(entry.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const payload = entry.asEmbed
        ? { embeds: [embed().setTitle(entry.title || 'Reminder').setDescription(entry.text)] }
        : { content: entry.text };
      await channel.send({ ...payload, allowedMentions: { parse: ['roles'] } })
        .catch((err) => log.warn(`scheduled ${entry.id} failed:`, err.message));
    }
    advance(entry, now);
  }
  if (ready.length) log.info(`posted ${ready.length} scheduled message(s)`);
  return ready.length;
}

/* ── daily prompt ──────────────────────────────────────────────────────── */

export const DEFAULT_PROMPTS = [
  'what are you working on today?',
  'drop the last photo you took (keep it clean)',
  'what should the next video be about?',
  "what's a song you've had on repeat this week?",
  'unpopular opinion, go',
  'what did you get done this week that you are quietly proud of?',
];

export async function postDailyPrompt(client, { now = new Date() } = {}) {
  const cfg = config.dailyPrompt ?? {};
  if (!cfg.enabled || !/^\d{17,20}$/.test(cfg.channelId ?? '')) return false;

  const stamp = now.toISOString().slice(0, 10);
  if (getIn('meta-prompt', 'lastRun') === stamp) return false;
  if (now.getUTCHours() < (cfg.hourUtc ?? 9)) return false;
  setIn('meta-prompt', 'lastRun', stamp);

  const prompts = (cfg.prompts ?? []).length ? cfg.prompts : DEFAULT_PROMPTS;
  // Rotate by date rather than at random, so nobody gets the same one twice running.
  const index = Math.floor(Date.parse(stamp) / 86_400_000) % prompts.length;

  const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel?.isTextBased()) return false;

  const message = await channel.send({
    embeds: [embed().setTitle('☀️ Daily prompt').setDescription(prompts[index])],
    allowedMentions: { parse: [] },
  }).catch(() => null);

  if (message && cfg.openThread) {
    await message.startThread({ name: `prompt · ${stamp}`, autoArchiveDuration: 1440 }).catch(() => {});
  }
  return true;
}

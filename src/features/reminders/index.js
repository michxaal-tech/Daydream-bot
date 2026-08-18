/**
 * /remindme — a nudge in the channel it was set in, or a DM.
 * Stored so they survive a restart; overdue ones fire on boot.
 */
import { collection, setIn, deleteIn, nextId } from '../../lib/store.js';
import { embed } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('remind');
const COLLECTION = 'reminders';
const timers = new Map();

/** "2h30m", "45m", "3 days" → milliseconds. Null when it can't be read. */
export function parseDuration(input) {
  const text = String(input ?? '').toLowerCase().trim();
  const units = { s: 1e3, sec: 1e3, m: 6e4, min: 6e4, h: 36e5, hr: 36e5, hour: 36e5, d: 864e5, day: 864e5, w: 6048e5, week: 6048e5 };
  let total = 0;
  const matches = text.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g);
  for (const [, amount, unit] of matches) {
    const key = Object.keys(units).find((u) => unit.startsWith(u));
    if (key) total += Number(amount) * units[key];
  }
  return total > 0 ? total : null;
}

export const listFor = (userId) =>
  Object.values(collection(COLLECTION)).filter((r) => r.userId === userId).sort((a, b) => a.dueAt - b.dueAt);

export function create({ userId, channelId, text, dueAt, dm }) {
  const id = String(nextId('reminder'));
  const reminder = { id, userId, channelId, text, dueAt, dm: Boolean(dm) };
  setIn(COLLECTION, id, reminder);
  return reminder;
}

export function cancel(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  deleteIn(COLLECTION, id);
}

async function fire(client, reminder) {
  const e = embed().setTitle('⏰ Reminder').setDescription(reminder.text);
  try {
    if (reminder.dm) {
      const user = await client.users.fetch(reminder.userId);
      await user.send({ embeds: [e] });
    } else {
      const channel = await client.channels.fetch(reminder.channelId);
      await channel.send({ content: `<@${reminder.userId}>`, embeds: [e], allowedMentions: { users: [reminder.userId] } });
    }
  } catch (err) {
    log.warn(`reminder ${reminder.id} could not be delivered:`, err.message);
  }
  cancel(reminder.id);
}

export function schedule(client, reminder) {
  const delay = reminder.dueAt - Date.now();
  if (delay <= 0) { fire(client, reminder); return; }
  if (delay > 2_147_483_647) return;
  const timer = setTimeout(() => fire(client, reminder), delay);
  timer.unref?.();
  timers.set(reminder.id, timer);
}

export function restore(client) {
  const all = Object.values(collection(COLLECTION));
  for (const reminder of all) schedule(client, reminder);
  if (all.length) log.info(`re-armed ${all.length} reminder(s)`);
}

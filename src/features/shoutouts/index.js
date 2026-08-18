/**
 * Shoutout queue: members submit, the creator gets a ranked list to read on
 * stream. Turns "notice me" energy into an orderly queue instead of the same
 * three people spamming a channel.
 */
import { collection, getIn, setIn, nextId } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';
import { recordEngagement } from '../analytics/index.js';

const COLLECTION = 'shoutouts';

export function submit({ userId, userTag, text }) {
  const cfg = config.shoutouts ?? {};
  if (!cfg.enabled) throw new Error('The shoutout queue is closed right now.');

  const mine = pending().filter((s) => s.userId === userId);
  const limit = cfg.perPersonLimit ?? 1;
  if (mine.length >= limit) {
    throw new Error(`You already have ${mine.length} in the queue. Wait until ${limit === 1 ? 'it is' : 'they are'} read.`);
  }

  const id = nextId('shoutout');
  const entry = { id, userId, userTag, text: String(text).slice(0, 300), at: Date.now(), read: false, upvotes: [] };
  setIn(COLLECTION, String(id), entry);
  recordEngagement(userId, 'shoutouts');
  return entry;
}

export const pending = () =>
  Object.values(collection(COLLECTION)).filter((s) => !s.read).sort((a, b) => b.upvotes.length - a.upvotes.length || a.at - b.at);

export function markRead(id) {
  const entry = getIn(COLLECTION, String(id));
  if (!entry) throw new Error('No shoutout with that number.');
  setIn(COLLECTION, String(id), { ...entry, read: true, readAt: Date.now() });
  return entry;
}

/** Read the next one and mark it done, so a stream can just keep hitting it. */
export function next() {
  const [top] = pending();
  if (!top) return null;
  markRead(top.id);
  return top;
}

export function queueEmbed(limit = 10) {
  const list = pending().slice(0, limit);
  return embed()
    .setTitle('📣 Shoutout queue')
    .setDescription(
      list.length
        ? list.map((s, i) => `**${i + 1}.** ${s.text}\n└ <@${s.userId}>${s.upvotes.length ? ` · ${s.upvotes.length} 👍` : ''}`).join('\n')
        : 'The queue is empty.'
    )
    .setFooter({ text: `${pending().length} waiting` });
}

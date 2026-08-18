/**
 * Polls, using Discord's native poll object — the one with radio buttons, a
 * Vote button and "N votes · 13h left". Discord counts the votes, hides them
 * until the poll closes, and renders it identically on every client.
 *
 * We keep a light record of the polls we posted so /poll end and /poll list
 * have something to work from; the votes themselves are Discord's business.
 */
import { PollLayoutType } from 'discord.js';
import { safeEmoji } from '../../lib/brand.js';
import { getMeta, setMeta } from '../../lib/store.js';
import { logger } from '../../lib/logger.js';

const log = logger('poll');
const KEY = 'poll:posted';

/** Discord's own limits — exceeding any of them rejects the whole message. */
export const LIMITS = {
  question: 300,
  answer: 55,
  answers: 10,
  minHours: 1,
  maxHours: 768, // 32 days
};

/**
 * "🎮 gaming | 🍜 food | 🎤 q&a" → [{emoji, text}, …]
 * Quotes get stripped: people paste the whole option list inside quotes, and a
 * leading `"` fused to the first emoji is rejected by Discord as an invalid one.
 */
export function parseOptions(input) {
  return String(input)
    .replace(/^["'`]+|["'`]+$/g, '')
    .split('|')
    .map((chunk) => chunk.trim().replace(/^["'`]+|["'`]+$/g, '').trim())
    .filter(Boolean)
    .slice(0, LIMITS.answers)
    .map((chunk) => {
      const [first, ...rest] = chunk.split(/\s+/);
      const emoji = safeEmoji(first);
      const text = (emoji ? rest.join(' ') : chunk).trim() || chunk;
      return { emoji, text: text.slice(0, LIMITS.answer) };
    })
    .filter((option) => option.text);
}

/** Build the payload Discord expects. Kept pure so it can be tested. */
export function buildPoll({ question, options, hours, multi }) {
  return {
    question: { text: String(question).slice(0, LIMITS.question) },
    answers: options.map((option) => ({
      text: option.text,
      ...(option.emoji ? { emoji: option.emoji } : {}),
    })),
    duration: Math.min(LIMITS.maxHours, Math.max(LIMITS.minHours, Math.round(hours))),
    allowMultiselect: Boolean(multi),
    layoutType: PollLayoutType.Default,
  };
}

export async function createPoll(channel, { question, options, hours, multi, mentionRoleId, author }) {
  const message = await channel.send({
    content: mentionRoleId ? `<@&${mentionRoleId}>` : undefined,
    allowedMentions: mentionRoleId ? { roles: [mentionRoleId] } : { parse: [] },
    poll: buildPoll({ question, options, hours, multi }),
  });

  remember({
    messageId: message.id,
    channelId: channel.id,
    question: String(question),
    authorId: author?.id ?? null,
    endsAt: Date.now() + Math.round(hours) * 3_600_000,
  });
  log.info(`poll posted in #${channel.name}: ${question}`);
  return message;
}

/** Close a poll early. Discord finalises the results and shows them to everyone. */
export async function endPoll(client, messageId) {
  const record = posted().find((p) => p.messageId === messageId);
  if (!record) throw new Error('No poll with that id — it may have been posted before a restart.');

  const channel = await client.channels.fetch(record.channelId);
  const message = await channel.messages.fetch(messageId);
  if (!message.poll) throw new Error('That message has no poll on it.');
  if (message.poll.resultsFinalized) throw new Error('That poll has already closed.');

  await message.poll.end();
  forget(messageId);
  log.info(`poll ${messageId} closed early`);
  return { record, message };
}

function posted() {
  // Anything past its close time is Discord's problem now, not ours to list.
  return getMeta(KEY, []).filter((p) => !p.endsAt || p.endsAt > Date.now());
}

function remember(record) {
  setMeta(KEY, [record, ...posted()].slice(0, 50));
}

function forget(messageId) {
  setMeta(KEY, posted().filter((p) => p.messageId !== messageId));
}

export function openPolls() {
  return posted();
}

/**
 * Suggestions, confessions and the counting game — the three things a quiet
 * server can switch on to give people something to do.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { collection, getIn, setIn, nextId } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed, COLORS } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';
import { recordEngagement } from '../analytics/index.js';

const log = logger('community');
const SUGGESTIONS = 'suggestions';
const COUNTING = 'counting';
export const SUGGEST_ID = 'suggest';

/* ── suggestions ───────────────────────────────────────────────────────── */

export function suggestionEmbed(suggestion) {
  const votes = suggestion.up.length - suggestion.down.length;
  const e = embed({ variant: suggestion.status === 'open' ? 'accent' : 'soft' })
    .setTitle(`💡 Suggestion #${suggestion.id}`)
    .setDescription(suggestion.text)
    .addFields(
      { name: 'Votes', value: `👍 ${suggestion.up.length} · 👎 ${suggestion.down.length} · net **${votes > 0 ? '+' : ''}${votes}**`, inline: true },
      { name: 'Status', value: STATUS[suggestion.status] ?? suggestion.status, inline: true }
    )
    .setFooter({ text: suggestion.anonymous ? 'Posted anonymously' : `From ${suggestion.authorTag}` })
    .setTimestamp(new Date(suggestion.at));
  if (suggestion.note) e.addFields({ name: 'Reply from staff', value: suggestion.note });
  if (suggestion.status === 'approved') e.setColor(COLORS.accent);
  if (suggestion.status === 'declined') e.setColor(COLORS.soft);
  return e;
}

const STATUS = { open: '🕓 Open', approved: '✅ Approved', declined: '❌ Declined', done: '🎉 Done' };

export const suggestionButtons = (suggestion) =>
  suggestion.status === 'open'
    ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`${SUGGEST_ID}:${suggestion.id}:up`).setStyle(ButtonStyle.Secondary).setLabel(String(suggestion.up.length)).setEmoji('👍'),
          new ButtonBuilder().setCustomId(`${SUGGEST_ID}:${suggestion.id}:down`).setStyle(ButtonStyle.Secondary).setLabel(String(suggestion.down.length)).setEmoji('👎')
        ),
      ]
    : [];

export async function createSuggestion(channel, { text, author, anonymous }) {
  const id = nextId('suggestion');
  const suggestion = {
    id, text, up: [], down: [], status: 'open', note: '',
    authorId: author.id, authorTag: author.tag ?? author.username,
    anonymous: Boolean(anonymous), at: Date.now(), messageId: null, channelId: channel.id,
  };
  const message = await channel.send({ embeds: [suggestionEmbed(suggestion)], components: suggestionButtons(suggestion) });
  suggestion.messageId = message.id;
  setIn(SUGGESTIONS, String(id), suggestion);
  return { suggestion, message };
}

export const getSuggestion = (id) => getIn(SUGGESTIONS, String(id));
export const openSuggestions = () =>
  Object.values(collection(SUGGESTIONS)).filter((s) => s.status === 'open').sort((a, b) => b.id - a.id);

/** One vote each; pressing the same side again takes it back. */
export async function handleSuggestionVote(interaction) {
  const [, rawId, side] = interaction.customId.split(':');
  const suggestion = getSuggestion(rawId);
  if (!suggestion) return 'That suggestion is no longer tracked.';
  if (suggestion.status !== 'open') return 'Voting on that one has closed.';

  const userId = interaction.user.id;
  const mine = side === 'up' ? 'up' : 'down';
  const other = mine === 'up' ? 'down' : 'up';

  suggestion[other] = suggestion[other].filter((id) => id !== userId);
  const had = suggestion[mine].includes(userId);
  if (!had) recordEngagement(userId, 'suggestions');
  suggestion[mine] = had ? suggestion[mine].filter((id) => id !== userId) : [...suggestion[mine], userId];
  setIn(SUGGESTIONS, String(suggestion.id), suggestion);

  await interaction.message.edit({ embeds: [suggestionEmbed(suggestion)], components: suggestionButtons(suggestion) });
  return had ? 'Vote withdrawn.' : `Voted ${mine === 'up' ? '👍' : '👎'}.`;
}

export async function setSuggestionStatus(client, id, status, note) {
  const suggestion = getSuggestion(id);
  if (!suggestion) throw new Error('No suggestion with that number.');
  suggestion.status = status;
  suggestion.note = note || suggestion.note;
  setIn(SUGGESTIONS, String(id), suggestion);

  const channel = await client.channels.fetch(suggestion.channelId).catch(() => null);
  const message = await channel?.messages.fetch(suggestion.messageId).catch(() => null);
  await message?.edit({ embeds: [suggestionEmbed(suggestion)], components: suggestionButtons(suggestion) }).catch(() => {});
  return suggestion;
}

/* ── confessions ───────────────────────────────────────────────────────── */

/**
 * Anonymous to the channel, not to the staff log — a confession box with no
 * accountability at all is a liability, so the author is recorded privately
 * when a log channel is set.
 */
export async function postConfession(client, { text, author }) {
  const cfg = config.confessions ?? {};
  if (!cfg.enabled) throw new Error('Confessions are switched off.');
  if (!/^\d{17,20}$/.test(cfg.channelId ?? '')) throw new Error('No confession channel is set.');

  const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error('The confession channel is missing.');

  const id = nextId('confession');
  const message = await channel.send({
    embeds: [embed().setTitle(`Confession #${id}`).setDescription(text).setFooter({ text: 'Sent anonymously' })],
    allowedMentions: { parse: [] },
  });

  if (/^\d{17,20}$/.test(cfg.logChannelId ?? '')) {
    const logChannel = await client.channels.fetch(cfg.logChannelId).catch(() => null);
    await logChannel?.send({
      embeds: [embed({ variant: 'soft' }).setTitle(`Confession #${id} — author`).setDescription(`<@${author.id}> \`${author.tag ?? author.username}\`\n\n${text}`)],
      allowedMentions: { parse: [] },
    }).catch(() => {});
  }
  return { id, url: message.url };
}

/* ── counting ──────────────────────────────────────────────────────────── */

export const countingState = () => getIn(COUNTING, 'state', { current: 0, lastUserId: null, best: 0 });

/**
 * Returns what should happen to a message in the counting channel.
 * Needs the Message Content intent to read the number at all.
 */
export function evaluateCount(content, userId, state = countingState(), cfg = config.counting ?? {}) {
  const number = Number(String(content ?? '').trim().split(/\s+/)[0]);
  if (!Number.isInteger(number)) return { action: 'ignore' };

  if (cfg.noDoubles !== false && state.lastUserId === userId) {
    return { action: 'reset', reason: 'you counted twice in a row', expected: state.current + 1 };
  }
  if (number !== state.current + 1) {
    return { action: 'reset', reason: `the next number was ${state.current + 1}`, expected: state.current + 1 };
  }
  return { action: 'accept', next: number, record: number > (state.best ?? 0) };
}

export function applyCount(result, userId) {
  const state = countingState();
  if (result.action === 'accept') {
    setIn(COUNTING, 'state', {
      current: result.next,
      lastUserId: userId,
      best: Math.max(state.best ?? 0, result.next),
    });
  } else if (result.action === 'reset') {
    setIn(COUNTING, 'state', { current: 0, lastUserId: null, best: state.best ?? 0 });
  }
  return countingState();
}

export async function handleCounting(message) {
  const cfg = config.counting ?? {};
  if (!cfg.enabled || message.channelId !== cfg.channelId) return;

  const result = evaluateCount(message.content, message.author.id);
  if (result.action === 'ignore') return;

  applyCount(result, message.author.id);

  if (result.action === 'reset') {
    await message.react('❌').catch(() => {});
    await message.channel.send(`💥 Ruined by <@${message.author.id}> — ${result.reason}. Back to **1**.`)
      .catch(() => {});
    return;
  }
  await message.react(result.record ? '🏆' : '✅').catch(() => {});
}

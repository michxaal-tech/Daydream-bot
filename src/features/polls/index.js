/**
 * Polls.
 *
 * Discord has a native poll object, but it can't be styled — no accent bar, no
 * custom copy. These are button polls instead: a lavender embed with a live bar
 * chart that redraws on every vote, so the whole thing stays on brand and can
 * do things native polls can't (role-gating, anonymous mode, custom colours).
 *
 * Votes live in the JSON store, keyed by message id, so a redeploy mid-poll
 * doesn't lose the results.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { embed, safeEmoji } from '../../lib/brand.js';
import { getMeta, setMeta } from '../../lib/store.js';
import { logger } from '../../lib/logger.js';

const log = logger('poll');
const KEY = (messageId) => `poll:${messageId}`;
const OPEN_KEY = 'poll:open';
const BARS = 12;
const timers = new Map();

export const MAX_OPTIONS = 10;

/** "🍕 Pizza | Burger | 🌮 Tacos" → [{emoji, label}, …] */
export function parseOptions(input) {
  return String(input)
    .split('|')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, MAX_OPTIONS)
    .map((chunk) => {
      const [first, ...rest] = chunk.split(/\s+/);
      const emoji = safeEmoji(first);
      return {
        emoji: emoji ?? null,
        label: (emoji ? rest.join(' ') : chunk).slice(0, 55) || chunk.slice(0, 55),
      };
    });
}

function load(messageId) {
  return getMeta(KEY(messageId));
}

function save(poll) {
  setMeta(KEY(poll.messageId), poll);
  const open = new Set(getMeta(OPEN_KEY, []));
  if (poll.closed) open.delete(poll.messageId);
  else open.add(poll.messageId);
  setMeta(OPEN_KEY, [...open]);
}

const totalVotes = (poll) => new Set(Object.keys(poll.votes)).size;
const countsFor = (poll) =>
  poll.options.map((_, i) => Object.values(poll.votes).filter((picks) => picks.includes(i)).length);

/** ▰▰▰▰▱▱▱▱▱▱▱▱ — a bar chart that survives Discord's proportional font. */
function bar(fraction) {
  const filled = Math.round(fraction * BARS);
  return `${'▰'.repeat(filled)}${'▱'.repeat(BARS - filled)}`;
}

export function renderPoll(poll) {
  const counts = countsFor(poll);
  const voters = totalVotes(poll);
  const cast = counts.reduce((a, b) => a + b, 0);

  const lines = poll.options.map((option, i) => {
    const share = cast ? counts[i] / cast : 0;
    const name = `${option.emoji ? `${option.emoji} ` : ''}**${option.label}**`;
    return `${name}\n\`${bar(share)}\` ${counts[i]} · ${Math.round(share * 100)}%`;
  });

  const e = embed({ variant: poll.closed ? 'soft' : 'accent' })
    .setTitle(`${poll.closed ? '📊 Final results' : '🗳️ '}${poll.closed ? '' : poll.question}`)
    .setDescription(
      [
        poll.closed ? `**${poll.question}**\n` : null,
        lines.join('\n\n'),
        '',
        poll.closed
          ? `Closed · ${voters} ${voters === 1 ? 'person' : 'people'} voted`
          : [
              `${voters} ${voters === 1 ? 'vote' : 'votes'}`,
              poll.multi ? 'pick as many as you like' : 'one pick each',
              poll.anonymous ? 'anonymous' : null,
              poll.roleId ? `<@&${poll.roleId}> only` : null,
              poll.endsAt ? `ends <t:${Math.floor(poll.endsAt / 1000)}:R>` : null,
            ]
              .filter(Boolean)
              .join(' · '),
      ]
        .filter((l) => l !== null)
        .join('\n')
    );

  if (poll.closed && cast) {
    const best = Math.max(...counts);
    const winners = poll.options.filter((_, i) => counts[i] === best).map((o) => o.label);
    e.addFields({
      name: winners.length > 1 ? 'Tied' : 'Winner',
      value: winners.join(' · '),
    });
  }
  if (poll.authorTag) e.setFooter({ text: `Poll by ${poll.authorTag}` });
  return e;
}

export function pollButtons(poll) {
  if (poll.closed) return [];
  const rows = [];
  for (let i = 0; i < poll.options.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        poll.options.slice(i, i + 5).map((option, j) => {
          const button = new ButtonBuilder()
            .setCustomId(`poll:${poll.messageId}:${i + j}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(option.label.slice(0, 40));
          if (option.emoji) button.setEmoji(option.emoji);
          return button;
        })
      )
    );
  }
  return rows;
}

/** Post a poll. The message id is only known after sending, so we send twice. */
export async function createPoll(channel, { question, options, durationMinutes, multi, anonymous, roleId, author, mentionRoleId }) {
  const poll = {
    messageId: 'pending',
    channelId: channel.id,
    question,
    options,
    votes: {},
    multi: Boolean(multi),
    anonymous: Boolean(anonymous),
    roleId: roleId ?? null,
    authorId: author?.id ?? null,
    authorTag: author?.tag ?? null,
    endsAt: durationMinutes ? Date.now() + durationMinutes * 60_000 : null,
    closed: false,
  };

  const message = await channel.send({
    content: mentionRoleId ? `<@&${mentionRoleId}>` : undefined,
    embeds: [renderPoll(poll)],
    allowedMentions: mentionRoleId ? { roles: [mentionRoleId] } : { parse: [] },
  });

  poll.messageId = message.id;
  save(poll);
  await message.edit({ embeds: [renderPoll(poll)], components: pollButtons(poll) });
  scheduleClose(message.client, poll);
  return { poll, message };
}

/** Handle a button press. Returns the ephemeral reply text. */
export async function handleVote(interaction) {
  const [, messageId, indexRaw] = interaction.customId.split(':');
  const poll = load(messageId);
  if (!poll) return 'That poll is no longer being tracked.';
  if (poll.closed) return 'That poll has closed.';

  if (poll.roleId && !interaction.member?.roles?.cache?.has(poll.roleId)) {
    return `Only <@&${poll.roleId}> can vote in this one.`;
  }

  const index = Number(indexRaw);
  const current = poll.votes[interaction.user.id] ?? [];
  let picks;
  let note;

  if (poll.multi) {
    picks = current.includes(index) ? current.filter((i) => i !== index) : [...current, index];
    note = current.includes(index)
      ? `Removed **${poll.options[index].label}**.`
      : `Added **${poll.options[index].label}**.`;
  } else if (current.includes(index)) {
    picks = [];
    note = 'Vote withdrawn.';
  } else {
    picks = [index];
    note = current.length
      ? `Changed to **${poll.options[index].label}**.`
      : `Voted **${poll.options[index].label}**.`;
  }

  if (picks.length) poll.votes[interaction.user.id] = picks;
  else delete poll.votes[interaction.user.id];
  save(poll);

  await interaction.message.edit({ embeds: [renderPoll(poll)], components: pollButtons(poll) });
  return note;
}

export async function closePoll(client, messageId, { by = 'schedule' } = {}) {
  const poll = load(messageId);
  if (!poll || poll.closed) return null;

  poll.closed = true;
  poll.closedAt = Date.now();
  save(poll);
  clearTimeout(timers.get(messageId));
  timers.delete(messageId);

  try {
    const channel = await client.channels.fetch(poll.channelId);
    const message = await channel.messages.fetch(messageId);
    await message.edit({ embeds: [renderPoll(poll)], components: [] });
    log.info(`poll ${messageId} closed by ${by} — ${totalVotes(poll)} voter(s)`);
  } catch (err) {
    log.warn(`could not update closed poll ${messageId}:`, err.message);
  }
  return poll;
}

function scheduleClose(client, poll) {
  if (!poll.endsAt) return;
  const delay = poll.endsAt - Date.now();
  if (delay <= 0) {
    closePoll(client, poll.messageId, { by: 'timer' });
    return;
  }
  // setTimeout maxes out at ~24.8 days; anything longer just re-arms on boot.
  if (delay > 2_147_483_647) return;
  const timer = setTimeout(() => closePoll(client, poll.messageId, { by: 'timer' }), delay);
  timer.unref?.();
  timers.set(poll.messageId, timer);
}

/** Re-arm timers for polls that were still open when the bot last stopped. */
export function restoreOpenPolls(client) {
  const open = getMeta(OPEN_KEY, []);
  let restored = 0;
  for (const messageId of open) {
    const poll = load(messageId);
    if (!poll || poll.closed) continue;
    scheduleClose(client, poll);
    restored++;
  }
  if (restored) log.info(`re-armed ${restored} open poll(s)`);
}

export function getPoll(messageId) {
  return load(messageId);
}

export function openPolls() {
  return getMeta(OPEN_KEY, [])
    .map(load)
    .filter((p) => p && !p.closed);
}

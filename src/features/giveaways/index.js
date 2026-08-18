/**
 * Giveaways: one button, a timer, a fair draw.
 *
 * Entries live in the store keyed by message id, so a restart mid-giveaway
 * doesn't lose anyone. Timers are re-armed at boot from the same records.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { collection, getIn, setIn, deleteIn } from '../../lib/store.js';
import { embed, COLORS } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('giveaway');
const COLLECTION = 'giveaways';
export const CUSTOM_ID = 'giveaway';
const timers = new Map();

export const active = () =>
  Object.values(collection(COLLECTION)).filter((g) => !g.ended).sort((a, b) => a.endsAt - b.endsAt);
export const getGiveaway = (messageId) => getIn(COLLECTION, messageId);

export function giveawayEmbed(giveaway) {
  const e = embed({ variant: giveaway.ended ? 'soft' : 'accent' })
    .setTitle(`🎁 ${giveaway.prize}`)
    .setDescription(
      giveaway.ended
        ? giveaway.winners?.length
          ? `Won by ${giveaway.winners.map((id) => `<@${id}>`).join(', ')}`
          : 'Nobody entered.'
        : [
            giveaway.description || null,
            `Ends <t:${Math.floor(giveaway.endsAt / 1000)}:R>`,
            giveaway.requiredRoleId ? `<@&${giveaway.requiredRoleId}> only` : null,
          ].filter(Boolean).join('\n')
    )
    .addFields(
      { name: 'Entries', value: String(giveaway.entrants?.length ?? 0), inline: true },
      { name: 'Winners', value: String(giveaway.winnerCount ?? 1), inline: true }
    );
  if (giveaway.hostTag) e.setFooter({ text: `Hosted by ${giveaway.hostTag}` });
  if (giveaway.ended) e.setColor(COLORS.soft);
  return e;
}

export const giveawayButtons = (giveaway) =>
  giveaway.ended
    ? []
    : [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${CUSTOM_ID}:${giveaway.messageId}`)
            .setStyle(ButtonStyle.Primary)
            .setLabel('Enter')
            .setEmoji('🎉')
        ),
      ];

export async function createGiveaway(channel, { prize, description, minutes, winnerCount, requiredRoleId, host, mentionRoleId }) {
  const giveaway = {
    messageId: 'pending', channelId: channel.id,
    prize, description: description ?? '',
    winnerCount: Math.max(1, winnerCount ?? 1),
    requiredRoleId: requiredRoleId ?? null,
    hostId: host?.id ?? null, hostTag: host?.tag ?? null,
    entrants: [], endsAt: Date.now() + minutes * 60_000,
    ended: false, winners: [],
  };

  const message = await channel.send({
    content: mentionRoleId ? `<@&${mentionRoleId}>` : undefined,
    allowedMentions: mentionRoleId ? { roles: [mentionRoleId] } : { parse: [] },
    embeds: [giveawayEmbed(giveaway)],
  });

  giveaway.messageId = message.id;
  setIn(COLLECTION, message.id, giveaway);
  await message.edit({ embeds: [giveawayEmbed(giveaway)], components: giveawayButtons(giveaway) });
  schedule(message.client, giveaway);
  log.info(`giveaway "${prize}" in #${channel.name}, ends in ${minutes}m`);
  return { giveaway, message };
}

/** Enter or leave. Returns the ephemeral reply. */
export async function handleButton(interaction) {
  const messageId = interaction.customId.split(':')[1];
  const giveaway = getGiveaway(messageId);
  if (!giveaway) return 'That giveaway is no longer tracked.';
  if (giveaway.ended) return 'That giveaway has finished.';

  if (giveaway.requiredRoleId && !interaction.member?.roles?.cache?.has(giveaway.requiredRoleId)) {
    return `This one is for <@&${giveaway.requiredRoleId}> only.`;
  }

  const entered = giveaway.entrants.includes(interaction.user.id);
  giveaway.entrants = entered
    ? giveaway.entrants.filter((id) => id !== interaction.user.id)
    : [...giveaway.entrants, interaction.user.id];
  setIn(COLLECTION, messageId, giveaway);

  await interaction.message.edit({ embeds: [giveawayEmbed(giveaway)], components: giveawayButtons(giveaway) });
  return entered
    ? "You're out — press Enter again if you change your mind."
    : `You're in. ${giveaway.entrants.length} entered so far.`;
}

/** Fisher-Yates over a copy, so every entrant has the same odds. */
export function draw(entrants, count, roll = Math.random) {
  const pool = [...entrants];
  const picked = [];
  while (picked.length < count && pool.length) {
    picked.push(...pool.splice(Math.floor(roll() * pool.length), 1));
  }
  return picked;
}

export async function endGiveaway(client, messageId, { reroll = false } = {}) {
  const giveaway = getGiveaway(messageId);
  if (!giveaway) throw new Error('No giveaway with that id.');
  if (giveaway.ended && !reroll) throw new Error('That giveaway has already ended.');

  giveaway.winners = draw(giveaway.entrants, giveaway.winnerCount);
  giveaway.ended = true;
  setIn(COLLECTION, messageId, giveaway);
  clearTimeout(timers.get(messageId));
  timers.delete(messageId);

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  const message = await channel?.messages.fetch(messageId).catch(() => null);
  await message?.edit({ embeds: [giveawayEmbed(giveaway)], components: [] }).catch(() => {});

  if (channel) {
    await channel.send({
      content: giveaway.winners.length
        ? `🎉 ${giveaway.winners.map((id) => `<@${id}>`).join(', ')} won **${giveaway.prize}**!`
        : `Nobody entered **${giveaway.prize}**.`,
      allowedMentions: { users: giveaway.winners },
      reply: message ? { messageReference: message.id, failIfNotExists: false } : undefined,
    }).catch((err) => log.warn('winner announce failed:', err.message));
  }
  log.info(`giveaway "${giveaway.prize}" ended — ${giveaway.winners.length} winner(s)`);
  return giveaway;
}

export function cancelGiveaway(messageId) {
  const giveaway = getGiveaway(messageId);
  if (!giveaway) throw new Error('No giveaway with that id.');
  clearTimeout(timers.get(messageId));
  timers.delete(messageId);
  deleteIn(COLLECTION, messageId);
  return giveaway;
}

function schedule(client, giveaway) {
  const delay = giveaway.endsAt - Date.now();
  if (delay <= 0) {
    endGiveaway(client, giveaway.messageId).catch((e) => log.warn(e.message));
    return;
  }
  if (delay > 2_147_483_647) return; // re-armed on the next boot instead
  const timer = setTimeout(
    () => endGiveaway(client, giveaway.messageId).catch((e) => log.warn(e.message)),
    delay
  );
  timer.unref?.();
  timers.set(giveaway.messageId, timer);
}

export function restore(client) {
  const open = active();
  for (const giveaway of open) schedule(client, giveaway);
  if (open.length) log.info(`re-armed ${open.length} giveaway(s)`);
}

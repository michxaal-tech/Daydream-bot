/**
 * Tickets: a private thread per request, with a transcript when it closes.
 * Threads rather than channels — no channel-limit problems, and the history
 * stays where it happened.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { collection, getIn, setIn, nextId } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('tickets');
const COLLECTION = 'tickets';
export const CUSTOM_ID = 'ticket';

export const TOPICS = [
  { id: 'support', label: 'Something is broken', emoji: '🛠️' },
  { id: 'report', label: 'Report a member', emoji: '🚩' },
  { id: 'business', label: 'Business enquiry', emoji: '💼' },
  { id: 'other', label: 'Something else', emoji: '💬' },
];

export function panel() {
  const cfg = config.tickets ?? {};
  return {
    embeds: [
      embed()
        .setTitle(cfg.title || 'Need a hand?')
        .setDescription(cfg.description || 'Open a private thread with the staff. Only you and they can see it.'),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        TOPICS.map((topic) =>
          new ButtonBuilder().setCustomId(`${CUSTOM_ID}:open:${topic.id}`).setStyle(ButtonStyle.Secondary).setLabel(topic.label).setEmoji(topic.emoji)
        )
      ),
    ],
  };
}

export const openFor = (userId) =>
  Object.values(collection(COLLECTION)).filter((t) => t.userId === userId && !t.closed);
export const allOpen = () => Object.values(collection(COLLECTION)).filter((t) => !t.closed);

export async function handleButton(interaction) {
  const cfg = config.tickets ?? {};
  if (!cfg.enabled) return 'Tickets are switched off.';

  const [, action, topicId] = interaction.customId.split(':');
  if (action === 'close') return closeFromButton(interaction);

  const existing = openFor(interaction.user.id);
  if (existing.length >= (cfg.maxOpenPerMember ?? 1)) {
    return `You already have a ticket open — <#${existing[0].threadId}>.`;
  }

  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS.at(-1);
  const id = nextId('ticket');

  const thread = await interaction.channel.threads.create({
    name: `${topic.emoji} ticket-${id}`,
    type: ChannelType.PrivateThread,
    invitable: false,
    autoArchiveDuration: 1440,
    reason: `ticket by ${interaction.user.username}`,
  }).catch((err) => {
    log.warn('thread create failed:', err.message);
    return null;
  });
  if (!thread) throw new Error("I couldn't open a thread here — I may be missing Create Private Threads.");

  await thread.members.add(interaction.user.id).catch(() => {});

  setIn(COLLECTION, String(id), {
    id, userId: interaction.user.id, userTag: interaction.user.username,
    topic: topic.id, threadId: thread.id, at: Date.now(), closed: false,
  });

  await thread.send({
    content: cfg.staffRoleId ? `<@&${cfg.staffRoleId}>` : undefined,
    embeds: [
      embed()
        .setTitle(`${topic.emoji} Ticket #${id} — ${topic.label}`)
        .setDescription(`Opened by <@${interaction.user.id}>. Say what you need and someone will pick it up.`),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${CUSTOM_ID}:close:${id}`).setStyle(ButtonStyle.Danger).setLabel('Close ticket').setEmoji('🔒')
      ),
    ],
    allowedMentions: cfg.staffRoleId ? { roles: [cfg.staffRoleId] } : { parse: [] },
  }).catch(() => {});

  return `Opened <#${thread.id}>.`;
}

async function closeFromButton(interaction) {
  const id = interaction.customId.split(':')[2];
  const ticket = getIn(COLLECTION, String(id));
  if (!ticket || ticket.closed) return 'That ticket is already closed.';

  const isOwner = ticket.userId === interaction.user.id;
  const isStaff = interaction.memberPermissions?.has('ManageMessages');
  if (!isOwner && !isStaff) return 'Only the person who opened it, or staff, can close it.';

  await closeTicket(interaction.client, id, interaction.user.username);
  return 'Closed. A transcript went to the staff log if one is set.';
}

/** Save what was said, then archive. A ticket with no record helps nobody. */
export async function closeTicket(client, id, closedBy) {
  const ticket = getIn(COLLECTION, String(id));
  if (!ticket || ticket.closed) throw new Error('No open ticket with that number.');

  const thread = await client.channels.fetch(ticket.threadId).catch(() => null);
  const cfg = config.tickets ?? {};

  if (thread && /^\d{17,20}$/.test(cfg.logChannelId ?? '')) {
    const messages = await thread.messages.fetch({ limit: 100 }).catch(() => null);
    const transcript = [...(messages?.values() ?? [])]
      .reverse()
      .filter((m) => m.content)
      .map((m) => `${m.author.username}: ${m.content}`)
      .join('\n')
      .slice(0, 3800);

    const logChannel = await client.channels.fetch(cfg.logChannelId).catch(() => null);
    await logChannel?.send({
      embeds: [
        embed({ variant: 'soft' })
          .setTitle(`🔒 Ticket #${id} closed`)
          .setDescription(transcript ? `\`\`\`\n${transcript}\n\`\`\`` : '_nothing was said_')
          .addFields(
            { name: 'Opened by', value: `<@${ticket.userId}>`, inline: true },
            { name: 'Closed by', value: closedBy ?? 'unknown', inline: true },
            { name: 'Topic', value: ticket.topic, inline: true }
          ),
      ],
      allowedMentions: { parse: [] },
    }).catch((err) => log.warn('transcript failed:', err.message));
  }

  setIn(COLLECTION, String(id), { ...ticket, closed: true, closedAt: Date.now(), closedBy });
  await thread?.setArchived(true, 'ticket closed').catch(() => {});
  return ticket;
}

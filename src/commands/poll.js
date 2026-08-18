import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { embed, assertCanPost } from '../lib/brand.js';
import {
  createPoll,
  parseOptions,
  closePoll,
  openPolls,
  getPoll,
  renderPoll,
  MAX_OPTIONS,
} from '../features/polls/index.js';

const DURATIONS = [
  { name: '5 minutes', value: 5 },
  { name: '15 minutes', value: 15 },
  { name: '1 hour', value: 60 },
  { name: '6 hours', value: 360 },
  { name: '24 hours', value: 1440 },
  { name: '3 days', value: 4320 },
  { name: '1 week', value: 10080 },
  { name: "don't close it", value: 0 },
];

export default {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Ask the server something')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)

    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Post a poll with buttons and live results')
        .addStringOption((o) =>
          o.setName('question').setDescription('What are you asking?').setRequired(true).setMaxLength(240)
        )
        .addStringOption((o) =>
          o
            .setName('options')
            .setDescription(`Separate with | — up to ${MAX_OPTIONS}. Lead with an emoji to give it an icon.`)
            .setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName('duration').setDescription('When it closes (default 24h)').addChoices(...DURATIONS)
        )
        .addBooleanOption((o) => o.setName('multi').setDescription('Let people pick more than one'))
        .addBooleanOption((o) => o.setName('anonymous').setDescription('Hide who voted for what'))
        .addRoleOption((o) => o.setName('only').setDescription('Restrict voting to one role'))
        .addRoleOption((o) => o.setName('ping').setDescription('Role to notify'))
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Post somewhere else')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )

    .addSubcommand((s) =>
      s
        .setName('end')
        .setDescription('Close a poll early and show the final results')
        .addStringOption((o) =>
          o.setName('poll').setDescription('Which poll').setRequired(true).setAutocomplete(true)
        )
    )

    .addSubcommand((s) => s.setName('list').setDescription('Every poll still open')),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      openPolls()
        .filter((p) => p.question.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((p) => ({ name: p.question.slice(0, 90), value: p.messageId }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const question = interaction.options.getString('question');
      const options = parseOptions(interaction.options.getString('options'));

      if (options.length < 2) {
        throw new Error(
          'A poll needs at least two options. Separate them with `|` — for example: `pizza | burgers | tacos`'
        );
      }

      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      assertCanPost(channel, await interaction.guild.members.fetchMe());

      const duration = interaction.options.getInteger('duration');
      const { message } = await createPoll(channel, {
        question,
        options,
        durationMinutes: duration === null ? 1440 : duration,
        multi: interaction.options.getBoolean('multi') ?? false,
        anonymous: interaction.options.getBoolean('anonymous') ?? false,
        roleId: interaction.options.getRole('only')?.id ?? null,
        mentionRoleId: interaction.options.getRole('ping')?.id ?? null,
        author: { id: interaction.user.id, tag: interaction.user.username },
      });

      return interaction.reply({
        content: `✅ Poll posted in ${channel} — ${message.url}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'end') {
      const messageId = interaction.options.getString('poll');
      const poll = getPoll(messageId);
      if (!poll) throw new Error('No poll with that id.');

      const isAuthor = poll.authorId === interaction.user.id;
      const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
      if (!isAuthor && !canManage) {
        throw new Error('Only whoever started the poll — or someone who can manage messages — can end it.');
      }

      const closed = await closePoll(interaction.client, messageId, { by: interaction.user.username });
      if (!closed) throw new Error('That poll is already closed.');
      return interaction.reply({ embeds: [renderPoll(closed)], flags: MessageFlags.Ephemeral });
    }

    // list
    const polls = openPolls();
    const e = embed()
      .setTitle('🗳️ Open polls')
      .setDescription(
        polls.length
          ? polls
              .map(
                (p) =>
                  `**${p.question}**\n` +
                  `<#${p.channelId}> · ${Object.keys(p.votes).length} voted` +
                  (p.endsAt ? ` · closes <t:${Math.floor(p.endsAt / 1000)}:R>` : ' · no end time')
              )
              .join('\n\n')
          : 'Nothing open right now. Start one with `/poll create`.'
      );
    return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
  },
};

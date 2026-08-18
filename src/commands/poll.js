import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { embed, assertCanPost } from '../lib/brand.js';
import { createPoll, parseOptions, endPoll, openPolls, LIMITS } from '../features/polls/index.js';

/** Discord's poll duration is in hours, minimum one. */
const DURATIONS = [
  { name: '1 hour', value: 1 },
  { name: '4 hours', value: 4 },
  { name: '8 hours', value: 8 },
  { name: '24 hours', value: 24 },
  { name: '3 days', value: 72 },
  { name: '1 week', value: 168 },
  { name: '2 weeks', value: 336 },
];

export default {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Ask the server something')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)

    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription("Post a poll — Discord's own, with the Vote button")
        .addStringOption((o) =>
          o
            .setName('question')
            .setDescription('What are you asking?')
            .setRequired(true)
            .setMaxLength(LIMITS.question)
        )
        .addStringOption((o) =>
          o
            .setName('options')
            .setDescription(`Separate with | — up to ${LIMITS.answers}. Start one with an emoji to give it an icon.`)
            .setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName('duration').setDescription('How long it runs (default 24h)').addChoices(...DURATIONS)
        )
        .addBooleanOption((o) => o.setName('multi').setDescription('Let people pick more than one'))
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
        .setDescription('Close a poll early and reveal the results')
        .addStringOption((o) =>
          o.setName('poll').setDescription('Which poll').setRequired(true).setAutocomplete(true)
        )
    )

    .addSubcommand((s) => s.setName('list').setDescription('Polls still running')),

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
      const options = parseOptions(interaction.options.getString('options'));
      if (options.length < 2) {
        throw new Error(
          'A poll needs at least two options. Separate them with `|`, like: `gaming | food | q&a`'
        );
      }

      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      assertCanPost(channel, await interaction.guild.members.fetchMe());

      const message = await createPoll(channel, {
        question: interaction.options.getString('question'),
        options,
        hours: interaction.options.getInteger('duration') ?? 24,
        multi: interaction.options.getBoolean('multi') ?? false,
        mentionRoleId: interaction.options.getRole('ping')?.id ?? null,
        author: { id: interaction.user.id, tag: interaction.user.username },
      });

      return interaction.reply({
        content: `✅ Poll posted in ${channel} — ${message.url}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'end') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const messageId = interaction.options.getString('poll');
      const record = openPolls().find((p) => p.messageId === messageId);

      const isAuthor = record?.authorId === interaction.user.id;
      const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
      if (record && !isAuthor && !canManage) {
        throw new Error('Only whoever started the poll — or someone who can manage messages — can end it.');
      }

      const { message } = await endPoll(interaction.client, messageId);
      return interaction.editReply(`✅ Closed. Results are on the poll: ${message.url}`);
    }

    // list
    const polls = openPolls();
    const e = embed()
      .setTitle('🗳️ Polls running')
      .setDescription(
        polls.length
          ? polls
              .map(
                (p) =>
                  `**${p.question}**\n<#${p.channelId}>` +
                  (p.endsAt ? ` · closes <t:${Math.floor(p.endsAt / 1000)}:R>` : '')
              )
              .join('\n\n')
          : 'Nothing running. Start one with `/poll create`.'
      );
    return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
  },
};

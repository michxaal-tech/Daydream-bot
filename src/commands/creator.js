import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { embed, assertCanPost } from '../lib/brand.js';
import { createTest, closeTest, activeTests, testEmbed } from '../features/abtest/index.js';
import { submit, pending, next, markRead, queueEmbed } from '../features/shoutouts/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('creator')
    .setDescription('Tools for running the channel')

    .addSubcommandGroup((g) => g.setName('ab').setDescription('Thumbnail A/B tests')
      .addSubcommand((s) => s.setName('start').setDescription('Put two options to a vote')
        .addStringOption((o) => o.setName('question').setDescription('What are you deciding?').setRequired(true))
        .addAttachmentOption((o) => o.setName('image_a').setDescription('Option A').setRequired(true))
        .addAttachmentOption((o) => o.setName('image_b').setDescription('Option B').setRequired(true))
        .addStringOption((o) => o.setName('label_a').setDescription('Name for A'))
        .addStringOption((o) => o.setName('label_b').setDescription('Name for B'))
        .addBooleanOption((o) => o.setName('live_results').setDescription('Show the split while voting is open'))
        .addChannelOption((o) => o.setName('channel').setDescription('Where to post').addChannelTypes(ChannelType.GuildText)))
      .addSubcommand((s) => s.setName('close').setDescription('Close a test and reveal the winner')
        .addStringOption((o) => o.setName('test').setDescription('Which test').setRequired(true).setAutocomplete(true)))
      .addSubcommand((s) => s.setName('list').setDescription('Tests still running')))

    .addSubcommandGroup((g) => g.setName('shoutout').setDescription('The shoutout queue')
      .addSubcommand((s) => s.setName('submit').setDescription('Ask for a shoutout')
        .addStringOption((o) => o.setName('text').setDescription('What should be read out?').setRequired(true).setMaxLength(300)))
      .addSubcommand((s) => s.setName('queue').setDescription('See what is waiting'))
      .addSubcommand((s) => s.setName('next').setDescription('Read the next one and clear it (staff)'))
      .addSubcommand((s) => s.setName('done').setDescription('Mark one as read (staff)')
        .addIntegerOption((o) => o.setName('number').setDescription('Which one').setRequired(true)))),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      activeTests()
        .filter((t) => t.question.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((t) => ({ name: t.question.slice(0, 90), value: String(t.id) }))
    );
  },

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    if (group === 'ab') {
      if (sub === 'list') {
        const running = activeTests();
        const e = embed().setTitle('🅰️🅱️ Tests running').setDescription(
          running.length
            ? running.map((t) => `**#${t.id}** ${t.question} — ${t.votes.a.length} / ${t.votes.b.length}`).join('\n')
            : 'None right now.'
        );
        return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new Error('Only staff can run A/B tests.');
      }

      if (sub === 'close') {
        const closed = await closeTest(interaction.client, interaction.options.getString('test'));
        return interaction.reply({ embeds: [testEmbed(closed)], flags: MessageFlags.Ephemeral });
      }

      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      assertCanPost(channel, await interaction.guild.members.fetchMe());
      const { test, message } = await createTest(channel, {
        question: interaction.options.getString('question'),
        labelA: interaction.options.getString('label_a') ?? 'A',
        labelB: interaction.options.getString('label_b') ?? 'B',
        imageA: interaction.options.getAttachment('image_a')?.url ?? null,
        imageB: interaction.options.getAttachment('image_b')?.url ?? null,
        showLive: interaction.options.getBoolean('live_results') ?? false,
        author: { id: interaction.user.id },
      });
      return interaction.reply({ content: `✅ Test **#${test.id}** posted — ${message.url}`, flags: MessageFlags.Ephemeral });
    }

    // shoutouts
    if (sub === 'submit') {
      const entry = submit({
        userId: interaction.user.id,
        userTag: interaction.user.username,
        text: interaction.options.getString('text'),
      });
      return interaction.reply({ content: `✅ You're in the queue at #${entry.id}. ${pending().length} waiting.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'queue') {
      return interaction.reply({ embeds: [queueEmbed()], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      throw new Error('Only staff can clear the queue.');
    }

    if (sub === 'next') {
      const entry = next();
      if (!entry) throw new Error('The queue is empty.');
      return interaction.reply({
        embeds: [embed().setTitle('📣 Next shoutout').setDescription(entry.text).setFooter({ text: `From ${entry.userTag}` })],
      });
    }

    const entry = markRead(interaction.options.getInteger('number'));
    return interaction.reply({ content: `✅ Cleared #${entry.id}.`, flags: MessageFlags.Ephemeral });
  },
};

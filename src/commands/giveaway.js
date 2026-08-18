import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { embed, assertCanPost } from '../lib/brand.js';
import { createGiveaway, endGiveaway, cancelGiveaway, active, getGiveaway } from '../features/giveaways/index.js';

const DURATIONS = [
  { name: '10 minutes', value: 10 }, { name: '1 hour', value: 60 },
  { name: '6 hours', value: 360 }, { name: '24 hours', value: 1440 },
  { name: '3 days', value: 4320 }, { name: '1 week', value: 10080 },
];

export default {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Run a giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((s) => s.setName('start').setDescription('Start one')
      .addStringOption((o) => o.setName('prize').setDescription('What they win').setRequired(true).setMaxLength(200))
      .addIntegerOption((o) => o.setName('duration').setDescription('How long it runs').setRequired(true).addChoices(...DURATIONS))
      .addIntegerOption((o) => o.setName('winners').setDescription('How many winners (default 1)').setMinValue(1).setMaxValue(20))
      .addStringOption((o) => o.setName('details').setDescription('Extra line under the prize'))
      .addRoleOption((o) => o.setName('required_role').setDescription('Only this role may enter'))
      .addRoleOption((o) => o.setName('ping').setDescription('Role to notify'))
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))

    .addSubcommand((s) => s.setName('end').setDescription('Draw the winners now')
      .addStringOption((o) => o.setName('giveaway').setDescription('Which one').setRequired(true).setAutocomplete(true)))

    .addSubcommand((s) => s.setName('reroll').setDescription('Draw again')
      .addStringOption((o) => o.setName('giveaway').setDescription('Which one').setRequired(true).setAutocomplete(true)))

    .addSubcommand((s) => s.setName('cancel').setDescription('Call it off without drawing')
      .addStringOption((o) => o.setName('giveaway').setDescription('Which one').setRequired(true).setAutocomplete(true)))

    .addSubcommand((s) => s.setName('list').setDescription('Giveaways running now')),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      active()
        .filter((g) => g.prize.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((g) => ({ name: `${g.prize} (${g.entrants.length} entered)`.slice(0, 90), value: g.messageId }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      assertCanPost(channel, await interaction.guild.members.fetchMe());

      const { message } = await createGiveaway(channel, {
        prize: interaction.options.getString('prize'),
        description: interaction.options.getString('details') ?? '',
        minutes: interaction.options.getInteger('duration'),
        winnerCount: interaction.options.getInteger('winners') ?? 1,
        requiredRoleId: interaction.options.getRole('required_role')?.id ?? null,
        mentionRoleId: interaction.options.getRole('ping')?.id ?? null,
        host: { id: interaction.user.id, tag: interaction.user.username },
      });
      return interaction.reply({ content: `🎁 Live in ${channel} — ${message.url}`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'list') {
      const running = active();
      const e = embed().setTitle('🎁 Giveaways running').setDescription(
        running.length
          ? running.map((g) => `**${g.prize}** · <#${g.channelId}> · ${g.entrants.length} entered · ends <t:${Math.floor(g.endsAt / 1000)}:R>`).join('\n')
          : 'None right now. Start one with `/giveaway start`.'
      );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    const messageId = interaction.options.getString('giveaway');
    if (!getGiveaway(messageId)) throw new Error('No giveaway with that id.');

    if (sub === 'cancel') {
      const cancelled = cancelGiveaway(messageId);
      return interaction.reply({ content: `Cancelled **${cancelled.prize}** — no winners drawn.`, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await endGiveaway(interaction.client, messageId, { reroll: sub === 'reroll' });
    return interaction.editReply(
      result.winners.length
        ? `${sub === 'reroll' ? 'Redrawn' : 'Drawn'}: ${result.winners.map((id) => `<@${id}>`).join(', ')}`
        : 'Nobody entered, so there was nothing to draw.'
    );
  },
};

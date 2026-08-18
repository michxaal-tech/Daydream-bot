import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { sendWelcome, buildWelcome } from '../features/welcome/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Welcome message tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('test')
        .setDescription('Fire a real welcome for yourself (pings you) in the welcome channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Override the target channel'))
    )
    .addSubcommand((s) =>
      s
        .setName('preview')
        .setDescription('Show the welcome message privately — no ping, nothing posted publicly')
    )
    .addSubcommand((s) =>
      s
        .setName('greet')
        .setDescription('Manually welcome a member who slipped through')
        .addUserOption((o) => o.setName('member').setDescription('Who to welcome').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'preview') {
      const payload = buildWelcome(interaction.member);
      return interaction.reply({
        ...payload,
        allowedMentions: { parse: [] },
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'test') {
      const channel = interaction.options.getChannel('channel');
      const msg = await sendWelcome(interaction.member, { channelId: channel?.id });
      return interaction.reply({
        content: msg ? `✅ Posted in ${msg.channel}.` : '⚠️ No welcome channel resolved — set `welcome.channelId` in config.json.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.options.getMember('member');
    if (!target) throw new Error('That user is not in this server.');
    const msg = await sendWelcome(target);
    return interaction.reply({
      content: msg ? `✅ Welcomed ${target} in ${msg.channel}.` : '⚠️ Could not resolve the welcome channel.',
      flags: MessageFlags.Ephemeral,
    });
  },
};

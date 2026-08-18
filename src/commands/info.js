import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';
import { discordTimestamp, parseWhen, TIMESTAMP_STYLES } from '../features/fun/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Look things up')
    .addSubcommand((s) => s.setName('user').setDescription('About a member')
      .addUserOption((o) => o.setName('member').setDescription('Who')))
    .addSubcommand((s) => s.setName('server').setDescription('About this server'))
    .addSubcommand((s) => s.setName('avatar').setDescription("Someone's avatar, full size")
      .addUserOption((o) => o.setName('member').setDescription('Who')))
    .addSubcommand((s) => s.setName('timestamp').setDescription('Make a timestamp that shows in everyone\'s own timezone')
      .addStringOption((o) => o.setName('when').setDescription('"in 2 hours", "tomorrow 9pm", "2026-09-01 18:30"').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'avatar') {
      const user = interaction.options.getUser('member') ?? interaction.user;
      return interaction.reply({
        embeds: [embed().setTitle(user.username).setImage(user.displayAvatarURL({ size: 1024 }))],
      });
    }

    if (sub === 'user') {
      const user = interaction.options.getUser('member') ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const roles = member?.roles.cache.filter((r) => r.id !== interaction.guild.id).map((r) => `<@&${r.id}>`) ?? [];
      const e = embed()
        .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'Account made', value: discordTimestamp(user.createdAt, 'R'), inline: true },
          { name: 'Joined here', value: member?.joinedAt ? discordTimestamp(member.joinedAt, 'R') : 'not in the server', inline: true },
          { name: 'ID', value: `\`${user.id}\`` },
          ...(roles.length ? [{ name: `Roles (${roles.length})`, value: roles.slice(0, 20).join(' ') }] : [])
        );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === 'server') {
      const guild = interaction.guild;
      const e = embed()
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: 'Members', value: guild.memberCount.toLocaleString(), inline: true },
          { name: 'Created', value: discordTimestamp(guild.createdAt, 'R'), inline: true },
          { name: 'Boosts', value: String(guild.premiumSubscriptionCount ?? 0), inline: true },
          { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
          { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
          { name: 'Emoji', value: String(guild.emojis.cache.size), inline: true }
        );
      return interaction.reply({ embeds: [e] });
    }

    // timestamp
    const when = parseWhen(interaction.options.getString('when'));
    if (!when) throw new Error('I couldn\'t read that. Try `in 2 hours`, `tomorrow 9pm`, or `2026-09-01 18:30`.');
    const lines = Object.entries(TIMESTAMP_STYLES)
      .map(([name, style]) => `${discordTimestamp(when, style)} — \`${discordTimestamp(when, style)}\``);
    return interaction.reply({
      embeds: [embed().setTitle('🕒 Copy one of these').setDescription(lines.join('\n'))],
      flags: MessageFlags.Ephemeral,
    });
  },
};

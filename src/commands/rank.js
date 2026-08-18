import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';
import { getMember, levelFromXp, rankOf, leaderboard } from '../features/levels/index.js';

const BAR = 14;
const bar = (fraction) => `${'▰'.repeat(Math.round(fraction * BAR))}${'▱'.repeat(BAR - Math.round(fraction * BAR))}`;

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Your level, or someone else\'s')
    .addUserOption((o) => o.setName('member').setDescription('Whose level to look up')),

  async execute(interaction) {
    const user = interaction.options.getUser('member') ?? interaction.user;
    const record = getMember(user.id);
    const { level, into, needed } = levelFromXp(record.xp);
    const { rank, of } = rankOf(user.id);
    const top = leaderboard(3).findIndex((m) => m.userId === user.id);

    const e = embed()
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .setTitle(`Level ${level}${top === 0 ? ' 👑' : ''}`)
      .setDescription(`\`${bar(needed ? into / needed : 0)}\`\n**${into} / ${needed}** XP to level ${level + 1}`)
      .addFields(
        { name: 'Rank', value: rank ? `#${rank} of ${of}` : 'unranked', inline: true },
        { name: 'Total XP', value: record.xp.toLocaleString(), inline: true },
        { name: 'Messages', value: record.messages.toLocaleString(), inline: true }
      );
    return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
  },
};

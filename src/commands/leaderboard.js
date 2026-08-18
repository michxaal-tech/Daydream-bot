import { SlashCommandBuilder } from 'discord.js';
import { embed } from '../lib/brand.js';
import { leaderboard } from '../features/levels/index.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Who talks the most')
    .addIntegerOption((o) => o.setName('size').setDescription('How many to show (default 10)').setMinValue(3).setMaxValue(25)),

  async execute(interaction) {
    const rows = leaderboard(interaction.options.getInteger('size') ?? 10);
    const e = embed()
      .setTitle('🏆 Leaderboard')
      .setDescription(
        rows.length
          ? rows
              .map((row, i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${row.userId}> · level **${row.level}** · ${row.xp.toLocaleString()} XP`)
              .join('\n')
          : 'Nobody has earned any XP yet.'
      );
    return interaction.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
};

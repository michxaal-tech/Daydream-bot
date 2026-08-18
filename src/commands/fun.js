import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';
import { EIGHTBALL, WOULD_YOU_RATHER, COMPLIMENTS, rollDice, pick, parseChoices } from '../features/fun/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('fun')
    .setDescription('Small distractions')
    .addSubcommand((s) => s.setName('8ball').setDescription('Ask the void')
      .addStringOption((o) => o.setName('question').setDescription('What do you want to know?').setRequired(true)))
    .addSubcommand((s) => s.setName('flip').setDescription('Flip a coin'))
    .addSubcommand((s) => s.setName('roll').setDescription('Roll dice')
      .addStringOption((o) => o.setName('dice').setDescription('e.g. 2d6 (default 1d20)')))
    .addSubcommand((s) => s.setName('choose').setDescription('Let me decide')
      .addStringOption((o) => o.setName('options').setDescription('Separate with commas').setRequired(true)))
    .addSubcommand((s) => s.setName('wyr').setDescription('Would you rather…'))
    .addSubcommand((s) => s.setName('compliment').setDescription('Say something nice')
      .addUserOption((o) => o.setName('member').setDescription('To whom'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === '8ball') {
      const question = interaction.options.getString('question');
      return interaction.reply({
        embeds: [embed().setTitle('🎱 the 8ball says').setDescription(`> ${question}\n\n**${pick(EIGHTBALL)}**`)],
      });
    }

    if (sub === 'flip') {
      const heads = Math.random() < 0.5;
      return interaction.reply(`🪙 **${heads ? 'Heads' : 'Tails'}**`);
    }

    if (sub === 'roll') {
      const notation = interaction.options.getString('dice') ?? '1d20';
      const result = rollDice(notation);
      if (!result) throw new Error('I read dice as `NdM` — try `2d6` or `1d20`.');
      return interaction.reply(
        `🎲 \`${notation}\` → **${result.total}**${result.count > 1 ? `\n${result.rolls.join(' + ')}` : ''}`
      );
    }

    if (sub === 'choose') {
      const choices = parseChoices(interaction.options.getString('options'));
      if (choices.length < 2) throw new Error('Give me at least two options, separated by commas.');
      return interaction.reply(`🤔 I pick **${pick(choices)}**`);
    }

    if (sub === 'wyr') {
      const [a, b] = pick(WOULD_YOU_RATHER);
      return interaction.reply({
        embeds: [embed().setTitle('Would you rather…').setDescription(`🅰️ ${a}\n\n🅱️ ${b}`)],
      });
    }

    const target = interaction.options.getUser('member');
    const line = pick(COMPLIMENTS);
    return interaction.reply(target ? `<@${target.id}> — ${line} 💜` : `${line} 💜`);
  },
};

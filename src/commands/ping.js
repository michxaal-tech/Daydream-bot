import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check the bot is awake'),

  async execute(interaction) {
    const e = embed()
      .setTitle('🏓 pong')
      .addFields(
        { name: 'Gateway', value: `${Math.round(interaction.client.ws.ping)}ms`, inline: true },
        { name: 'Uptime', value: `<t:${Math.floor((Date.now() - interaction.client.uptime) / 1000)}:R>`, inline: true }
      );
    return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
  },
};

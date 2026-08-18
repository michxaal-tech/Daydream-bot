import { Events, MessageFlags } from 'discord.js';
import { logger } from '../lib/logger.js';

const log = logger('cmd');

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    if (interaction.isAutocomplete()) {
      try {
        await command.autocomplete?.(interaction);
      } catch (err) {
        log.debug('autocomplete failed:', err.message);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      log.error(`/${interaction.commandName} failed:`, err);
      const body = { content: `⚠️ ${err.message}`, flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(body).catch(() => {});
      } else {
        await interaction.reply(body).catch(() => {});
      }
    }
  },
};

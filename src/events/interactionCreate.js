import { Events, MessageFlags } from 'discord.js';
import { logger } from '../lib/logger.js';
import { handleVote } from '../features/polls/index.js';

const log = logger('cmd');

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Poll votes reply ephemerally and edit the poll message in place.
    if (interaction.isButton() && interaction.customId.startsWith('poll:')) {
      try {
        const note = await handleVote(interaction);
        return interaction.reply({ content: note, flags: MessageFlags.Ephemeral });
      } catch (err) {
        log.error('poll vote failed:', err);
        return interaction
          .reply({ content: `⚠️ ${err.message}`, flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }

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

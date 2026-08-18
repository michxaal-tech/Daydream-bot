import { Events, MessageFlags } from 'discord.js';
import { logger } from '../lib/logger.js';
import { CUSTOM_ID as ROLE_MENU, handleButton as roleMenuButton } from '../features/roles/index.js';
import { CUSTOM_ID as GIVEAWAY, handleButton as giveawayButton } from '../features/giveaways/index.js';
import { SUGGEST_ID, handleSuggestionVote } from '../features/community/index.js';
import { CUSTOM_ID as ABTEST, handleButton as abtestButton } from '../features/abtest/index.js';
import { CUSTOM_ID as VERIFY, handleButton as verifyButton } from '../features/verification/index.js';
import { CUSTOM_ID as TICKET, handleButton as ticketButton } from '../features/tickets/index.js';

/** Buttons that reply privately and edit their own message in place. */
const BUTTONS = {
  [ROLE_MENU]: roleMenuButton,
  [GIVEAWAY]: giveawayButton,
  [SUGGEST_ID]: handleSuggestionVote,
  [ABTEST]: abtestButton,
  [VERIFY]: verifyButton,
  [TICKET]: ticketButton,
};

const log = logger('cmd');

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isButton()) {
      const handler = BUTTONS[interaction.customId.split(':')[0]];
      if (!handler) return;
      try {
        const reply = await handler(interaction);
        if (reply === null) return; // the handler answered for itself
        return await interaction.reply({ content: reply, flags: MessageFlags.Ephemeral });
      } catch (err) {
        log.error(`button ${interaction.customId} failed:`, err);
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

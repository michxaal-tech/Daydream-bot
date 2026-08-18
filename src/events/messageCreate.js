import { Events } from 'discord.js';
import { handleMessage as levels } from '../features/levels/index.js';
import { handleMessage as automod } from '../features/moderation/automod.js';

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author?.bot || !message.guild) return;
    // Automod first — a message that's about to be deleted shouldn't earn XP.
    await automod(message);
    if (!message.deletable || message.deleted) return;
    await levels(message);
  },
};

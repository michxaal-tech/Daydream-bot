import { Events } from 'discord.js';
import { sync } from '../features/starboard/index.js';
import { handleReaction as firstHour } from '../features/firsthour/index.js';
import { recordEngagement } from '../features/analytics/index.js';
import { config } from '../lib/config.js';

export default {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    if (user.bot) return;
    if ((reaction.emoji.name ?? '') === (config.starboard?.emoji ?? '⭐')) {
      recordEngagement(user.id, 'stars');
    }
    await Promise.all([sync(reaction, reaction.client), firstHour(reaction, user)]);
  },
};

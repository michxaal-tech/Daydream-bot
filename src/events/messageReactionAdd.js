import { Events } from 'discord.js';
import { sync } from '../features/starboard/index.js';

export default {
  name: Events.MessageReactionAdd,
  execute: (reaction, user) => (user.bot ? undefined : sync(reaction, reaction.client)),
};

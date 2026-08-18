import { Events } from 'discord.js';
import { sync } from '../features/starboard/index.js';

export default {
  name: Events.MessageReactionRemove,
  execute: (reaction) => sync(reaction, reaction.client),
};

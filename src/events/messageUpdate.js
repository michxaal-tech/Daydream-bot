import { Events } from 'discord.js';
import { messageEdited } from '../features/logging/index.js';

export default {
  name: Events.MessageUpdate,
  execute: (before, after) => messageEdited(before, after),
};

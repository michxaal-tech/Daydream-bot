import { Events } from 'discord.js';
import { messageDeleted } from '../features/logging/index.js';

export default {
  name: Events.MessageDelete,
  execute: (message) => messageDeleted(message),
};

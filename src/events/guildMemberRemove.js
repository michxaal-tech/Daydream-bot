import { Events } from 'discord.js';
import { handleLeave } from '../features/welcome/index.js';

export default {
  name: Events.GuildMemberRemove,
  execute: (member) => handleLeave(member),
};

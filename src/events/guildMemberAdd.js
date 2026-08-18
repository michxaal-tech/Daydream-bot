import { Events } from 'discord.js';
import { handleJoin } from '../features/welcome/index.js';

export default {
  name: Events.GuildMemberAdd,
  execute: (member) => handleJoin(member),
};

import { Events } from 'discord.js';
import { handleLeave } from '../features/welcome/index.js';
import { rememberRoles } from '../features/profiles/index.js';
import { memberLeft } from '../features/logging/index.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    rememberRoles(member);
    await memberLeft(member);
    await handleLeave(member);
  },
};

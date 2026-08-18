import { Events } from 'discord.js';
import { handleJoin } from '../features/welcome/index.js';
import { handleJoin as screenJoin } from '../features/moderation/automod.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    // A brand-new account that gets bounced should never see a welcome post.
    if (await screenJoin(member)) return;
    await handleJoin(member);
  },
};

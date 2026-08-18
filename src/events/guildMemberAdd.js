import { Events } from 'discord.js';
import { handleJoin } from '../features/welcome/index.js';
import { handleJoin as screenJoin } from '../features/moderation/automod.js';
import { restoreRoles } from '../features/profiles/index.js';
import { whichInvite, memberJoined } from '../features/logging/index.js';
import { recordJoin } from '../features/analytics/index.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    // Work out the invite before anything else changes the counts.
    const invite = await whichInvite(member.guild).catch(() => null);

    recordJoin({ userId: member.id, inviteCode: invite?.code ?? null, inviterTag: invite?.inviterTag ?? null });

    // A brand-new account that gets bounced should never see a welcome post.
    if (await screenJoin(member)) return;

    await restoreRoles(member);
    await memberJoined(member, invite);
    await handleJoin(member);
  },
};

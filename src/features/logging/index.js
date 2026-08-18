/**
 * Server logs: edits, deletes, joins, leaves, and which invite brought someone
 * in. Everything is opt-in per event type, because a log channel that catches
 * everything is a log channel nobody reads.
 */
import { config } from '../../lib/config.js';
import { embed, COLORS } from '../../lib/brand.js';
import { collection, setIn } from '../../lib/store.js';
import { logger } from '../../lib/logger.js';

const log = logger('logs');
const INVITES = 'inviteUses';

const cfg = () => config.logging ?? {};

async function post(client, channelKey, e) {
  const channelId = cfg()[channelKey];
  if (!/^\d{17,20}$/.test(channelId ?? '')) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [e], allowedMentions: { parse: [] } }).catch((err) => log.warn('log post failed:', err.message));
}

export async function messageDeleted(message) {
  if (!cfg().logDeletes || message.author?.bot || !message.guild) return;
  const e = embed({ variant: 'soft' })
    .setAuthor({ name: message.author?.username ?? 'unknown', iconURL: message.author?.displayAvatarURL?.() })
    .setTitle('🗑️ Message deleted')
    .setDescription(message.content?.slice(0, 1500) || '_no text — attachment or embed only_')
    .addFields({ name: 'Channel', value: `<#${message.channelId}>` })
    .setColor(COLORS.soft)
    .setTimestamp(new Date());
  await post(message.client, 'messageLogChannelId', e);
}

export async function messageEdited(before, after) {
  if (!cfg().logEdits || after.author?.bot || !after.guild) return;
  if (before.content === after.content) return; // embed loading counts as an edit
  const e = embed({ variant: 'soft' })
    .setAuthor({ name: after.author?.username ?? 'unknown', iconURL: after.author?.displayAvatarURL?.() })
    .setTitle('✏️ Message edited')
    .addFields(
      { name: 'Before', value: before.content?.slice(0, 900) || '_empty_' },
      { name: 'After', value: after.content?.slice(0, 900) || '_empty_' },
      { name: 'Where', value: `<#${after.channelId}> · [jump](${after.url})` }
    )
    .setTimestamp(new Date());
  await post(after.client, 'messageLogChannelId', e);
}

export async function memberJoined(member, invite) {
  if (!cfg().logJoins) return;
  const e = embed()
    .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
    .setTitle('📥 Member joined')
    .addFields(
      { name: 'Account created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Members now', value: String(member.guild.memberCount), inline: true },
      ...(invite ? [{ name: 'Invite', value: `\`${invite.code}\`${invite.inviterTag ? ` from ${invite.inviterTag}` : ''}` }] : [])
    )
    .setTimestamp(new Date());
  await post(member.client, 'memberLogChannelId', e);
}

export async function memberLeft(member) {
  if (!cfg().logLeaves) return;
  const roles = member.roles?.cache?.filter((r) => r.id !== member.guild.id)?.map((r) => r.name) ?? [];
  const e = embed({ variant: 'soft' })
    .setAuthor({ name: member.user?.username ?? 'unknown', iconURL: member.user?.displayAvatarURL?.() })
    .setTitle('📤 Member left')
    .addFields(
      { name: 'Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'unknown', inline: true },
      { name: 'Members now', value: String(member.guild.memberCount), inline: true },
      ...(roles.length ? [{ name: 'Roles they had', value: roles.slice(0, 15).join(', ') }] : [])
    )
    .setTimestamp(new Date());
  await post(member.client, 'memberLogChannelId', e);
}

/* ── invite attribution ────────────────────────────────────────────────── */

/**
 * Discord never says which invite was used, so we snapshot every invite's use
 * count and diff it on join. The one that went up is the one they used.
 */
export async function snapshotInvites(guild) {
  if (!cfg().trackInvites) return;
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return;
  const snapshot = {};
  for (const invite of invites.values()) {
    snapshot[invite.code] = { uses: invite.uses ?? 0, inviterTag: invite.inviter?.username ?? null };
  }
  setIn(INVITES, guild.id, snapshot);
}

export async function whichInvite(guild) {
  if (!cfg().trackInvites) return null;
  const before = collection(INVITES)[guild.id] ?? {};
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null;

  let used = null;
  const snapshot = {};
  for (const invite of invites.values()) {
    const uses = invite.uses ?? 0;
    snapshot[invite.code] = { uses, inviterTag: invite.inviter?.username ?? null };
    if (uses > (before[invite.code]?.uses ?? 0)) {
      used = { code: invite.code, inviterTag: invite.inviter?.username ?? null };
    }
  }
  setIn(INVITES, guild.id, snapshot);
  return used;
}

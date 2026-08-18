import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';
import { logAction, caseEmbed } from '../features/moderation/cases.js';
import {
  jail, unjail, setMute, softban, hardban, unhardban, tempban, hardBans, tempbans,
  forceNick, releaseNick, stripStaff, isStaff, renderInvoke, MUTE_KINDS,
} from '../features/moderation/punishments.js';

const DURATIONS = [
  { name: '1 hour', value: 60 }, { name: '6 hours', value: 360 },
  { name: '1 day', value: 1440 }, { name: '3 days', value: 4320 },
  { name: '1 week', value: 10080 }, { name: '30 days', value: 43200 },
];
const MUTE_CHOICES = Object.entries(MUTE_KINDS).map(([value, spec]) => ({ name: spec.label, value }));

/** Everything here needs the target to be below both you and the bot. */
async function target(interaction, { requireMember = true } = {}) {
  const user = interaction.options.getUser('member');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member && requireMember) throw new Error('That member is not in the server.');
  if (user.id === interaction.user.id) throw new Error("You can't action yourself.");

  if (member) {
    const me = await interaction.guild.members.fetchMe();
    if (member.roles.highest.position >= me.roles.highest.position) {
      throw new Error(`**${user.username}** has a role above mine, so I can't touch them.`);
    }
    if (
      member.roles.highest.position >= interaction.member.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    ) {
      throw new Error(`**${user.username}** is your rank or higher.`);
    }
  }
  return { user, member };
}

export default {
  data: new SlashCommandBuilder()
    .setName('punish')
    .setDescription('Jail, mute and ban tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    .addSubcommand((s) => s.setName('jail').setDescription('Strip their roles and confine them to the jail channel')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))
    .addSubcommand((s) => s.setName('unjail').setDescription('Release them and give their roles back')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))

    .addSubcommand((s) => s.setName('mute').setDescription('Text, image or reaction mute')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('type').setDescription('Which kind').setRequired(true).addChoices(...MUTE_CHOICES))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))
    .addSubcommand((s) => s.setName('unmute').setDescription('Lift a mute')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('type').setDescription('Which kind').setRequired(true).addChoices(...MUTE_CHOICES)))

    .addSubcommand((s) => s.setName('tempban').setDescription('Ban with an expiry')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addIntegerOption((o) => o.setName('duration').setDescription('How long').setRequired(true).addChoices(...DURATIONS))
      .addStringOption((o) => o.setName('reason').setDescription('Why'))
      .addIntegerOption((o) => o.setName('purge_days').setDescription('Delete their recent messages').setMinValue(0).setMaxValue(7)))

    .addSubcommand((s) => s.setName('softban').setDescription('Ban and immediately unban, to clear their messages')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))

    .addSubcommand((s) => s.setName('hardban').setDescription('Ban permanently — rejoins get banned again automatically')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))
    .addSubcommand((s) => s.setName('unhardban').setDescription('Lift a hard ban')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))

    .addSubcommand((s) => s.setName('forcenick').setDescription('Lock someone to a nickname')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('nickname').setDescription('Leave empty to release').setMaxLength(32)))

    .addSubcommand((s) => s.setName('stripstaff').setDescription('Remove every role with a dangerous permission')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))

    .addSubcommand((s) => s.setName('list').setDescription('Hard bans and temporary bans in force')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (!isStaff(interaction.member)) throw new Error('You are not bound as staff on this server.');

    if (sub === 'list') {
      const hard = hardBans();
      const temp = tempbans();
      const e = embed()
        .setTitle('🔨 Bans in force')
        .addFields(
          { name: `Hard bans (${hard.length})`, value: hard.length ? hard.slice(0, 10).map((b) => `<@${b.userId}> — ${b.reason}`).join('\n') : 'none' },
          { name: `Temporary (${temp.length})`, value: temp.length ? temp.slice(0, 10).map((b) => `<@${b.userId}> — lifts <t:${Math.floor(b.until / 1000)}:R>`).join('\n') : 'none' }
        );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    const needsPresence = !['hardban', 'unhardban', 'tempban'].includes(sub);
    const { user, member } = await target(interaction, { requireMember: needsPresence });
    const reason = interaction.options.getString('reason') ?? 'No reason given';
    const base = {
      userId: user.id, userTag: user.tag ?? user.username, reason,
      moderatorId: interaction.user.id, moderatorTag: interaction.user.username,
    };
    const tokens = { user: user.username, moderator: interaction.user.username, reason };

    // The DM has to go out before a ban, or there is no shared server left.
    const notify = async (extra = {}) => {
      const dm = renderInvoke(sub, 'dm', { ...tokens, ...extra });
      if (dm) await user.send(dm).catch(() => {});
    };
    const say = (fallback, extra = {}) => renderInvoke(sub, 'message', { ...tokens, ...extra }) ?? fallback;

    if (sub === 'jail') {
      await notify();
      const { removed, channelId } = await jail(member, { reason });
      const entry = await logAction(interaction.client, { action: 'automod', ...base, reason: `Jailed — ${reason}` });
      return interaction.reply({
        content: say(`🔒 Jailed **${user.username}** — ${removed} role(s) taken, they can only see ${channelId ? `<#${channelId}>` : 'the jail channel'}. Case #${entry.id}.`),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'unjail') {
      const restored = await unjail(member);
      await logAction(interaction.client, { action: 'untimeout', ...base, reason: 'Released from jail' });
      return interaction.reply({ content: say(`🔓 Released **${user.username}** — ${restored} role(s) put back.`), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'mute' || sub === 'unmute') {
      const kind = interaction.options.getString('type');
      const on = sub === 'mute';
      if (on) await notify();
      const label = await setMute(member, kind, on, { reason });
      const entry = await logAction(interaction.client, {
        action: on ? 'timeout' : 'untimeout', ...base, reason: `${on ? 'Applied' : 'Lifted'} ${label} — ${reason}`,
      });
      return interaction.reply({ embeds: [caseEmbed(entry)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'tempban') {
      const minutes = interaction.options.getInteger('duration');
      await notify({ duration: `${minutes} minutes` });
      const until = await tempban(interaction.guild, user.id, {
        minutes, reason, deleteDays: interaction.options.getInteger('purge_days') ?? 0,
      });
      const entry = await logAction(interaction.client, { action: 'ban', ...base, duration: `${minutes} min` });
      return interaction.reply({
        content: say(`⏳ Banned **${user.username}** until <t:${Math.floor(until / 1000)}:f>. Case #${entry.id}.`),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'softban') {
      await notify();
      await softban(interaction.guild, user.id, { reason });
      const entry = await logAction(interaction.client, { action: 'kick', ...base, reason: `Softban — ${reason}` });
      return interaction.reply({ content: say(`🧹 Softbanned **${user.username}** — messages cleared, they can rejoin. Case #${entry.id}.`), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'hardban') {
      await notify();
      await hardban(interaction.guild, user.id, { reason, by: interaction.user.username });
      const entry = await logAction(interaction.client, { action: 'ban', ...base, reason: `Hard ban — ${reason}` });
      return interaction.reply({ content: say(`🔨 Hard-banned **${user.username}**. Any rejoin is banned again automatically. Case #${entry.id}.`), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'unhardban') {
      const had = unhardban(user.id);
      await interaction.guild.members.unban(user.id, `unbanned by ${interaction.user.username}`).catch(() => {});
      await logAction(interaction.client, { action: 'unban', ...base, reason: 'Hard ban lifted' });
      return interaction.reply({ content: had ? `✅ Hard ban on **${user.username}** lifted.` : `They weren't hard-banned, but I unbanned them anyway.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'forcenick') {
      const nickname = interaction.options.getString('nickname');
      if (!nickname) {
        const had = releaseNick(user.id);
        return interaction.reply({ content: had ? `✅ **${user.username}** can pick their own nickname again.` : 'They had no forced nickname.', flags: MessageFlags.Ephemeral });
      }
      await forceNick(member, nickname);
      await logAction(interaction.client, { action: 'automod', ...base, reason: `Nickname forced to "${nickname}"` });
      return interaction.reply({ content: `✅ **${user.username}** is locked to **${nickname}**.`, flags: MessageFlags.Ephemeral });
    }

    // stripstaff
    const removed = await stripStaff(member, { reason });
    await logAction(interaction.client, { action: 'automod', ...base, reason: `Staff roles stripped — ${reason}` });
    return interaction.reply({
      content: removed.length ? `🚫 Took **${removed.join('**, **')}** from ${user.username}.` : 'They had no roles with dangerous permissions.',
      flags: MessageFlags.Ephemeral,
    });
  },
};

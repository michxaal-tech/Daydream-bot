import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';
import { logAction, casesFor, allCases, caseEmbed, ACTIONS } from '../features/moderation/cases.js';

/** Discord caps a timeout at 28 days. */
const DURATIONS = [
  { name: '60 seconds', value: 1 }, { name: '5 minutes', value: 5 },
  { name: '10 minutes', value: 10 }, { name: '1 hour', value: 60 },
  { name: '6 hours', value: 360 }, { name: '24 hours', value: 1440 },
  { name: '1 week', value: 10080 },
];

export default {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    .addSubcommand((s) => s.setName('warn').setDescription('Warn a member')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(true)))

    .addSubcommand((s) => s.setName('timeout').setDescription('Mute a member for a while')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addIntegerOption((o) => o.setName('duration').setDescription('How long').setRequired(true).addChoices(...DURATIONS))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))

    .addSubcommand((s) => s.setName('untimeout').setDescription('Lift a timeout early')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))

    .addSubcommand((s) => s.setName('kick').setDescription('Remove a member')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why')))

    .addSubcommand((s) => s.setName('ban').setDescription('Ban a member')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why'))
      .addIntegerOption((o) => o.setName('purge_days').setDescription('Delete their recent messages').setMinValue(0).setMaxValue(7)))

    .addSubcommand((s) => s.setName('history').setDescription('Every case for a member')
      .addUserOption((o) => o.setName('member').setDescription('Who').setRequired(true)))

    .addSubcommand((s) => s.setName('cases').setDescription('The most recent cases in the server')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const moderator = { moderatorId: interaction.user.id, moderatorTag: interaction.user.username };

    if (sub === 'history' || sub === 'cases') {
      const user = sub === 'history' ? interaction.options.getUser('member') : null;
      const list = (user ? casesFor(user.id) : allCases()).slice(0, 12);
      const e = embed()
        .setTitle(user ? `Cases for ${user.username}` : 'Recent cases')
        .setDescription(
          list.length
            ? list
                .map((c) => {
                  const meta = ACTIONS[c.action] ?? { emoji: '•', label: c.action };
                  return `${meta.emoji} **#${c.id}** ${meta.label} · <@${c.userId}>\n└ ${c.reason} — <t:${Math.floor(c.at / 1000)}:R>`;
                })
                .join('\n')
            : 'Nothing on record.'
        );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    const user = interaction.options.getUser('member');
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    const reason = interaction.options.getString('reason') ?? 'No reason given';

    if (target) {
      if (target.id === interaction.user.id) throw new Error("You can't action yourself.");
      const me = await interaction.guild.members.fetchMe();
      if (target.roles.highest.position >= me.roles.highest.position) {
        throw new Error(`**${target.user.username}** has a role above mine, so I can't action them.`);
      }
      if (
        target.roles.highest.position >= interaction.member.roles.highest.position &&
        interaction.guild.ownerId !== interaction.user.id
      ) {
        throw new Error(`**${target.user.username}** is the same rank as you or higher.`);
      }
    } else if (sub !== 'ban') {
      throw new Error('That member is not in the server.');
    }

    const base = { userId: user.id, userTag: user.tag ?? user.username, reason, ...moderator };

    if (sub === 'warn') {
      await target.send(`You were warned in **${interaction.guild.name}**: ${reason}`).catch(() => {});
      const entry = await logAction(interaction.client, { action: 'warn', ...base });
      return interaction.reply({ embeds: [caseEmbed(entry)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'timeout') {
      const minutes = interaction.options.getInteger('duration');
      await target.timeout(minutes * 60_000, reason);
      const entry = await logAction(interaction.client, { action: 'timeout', duration: `${minutes} min`, ...base });
      return interaction.reply({ embeds: [caseEmbed(entry)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'untimeout') {
      await target.timeout(null, `lifted by ${interaction.user.username}`);
      const entry = await logAction(interaction.client, { action: 'untimeout', ...base, reason: 'Timeout lifted' });
      return interaction.reply({ embeds: [caseEmbed(entry)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'kick') {
      await target.kick(reason);
      const entry = await logAction(interaction.client, { action: 'kick', ...base });
      return interaction.reply({ embeds: [caseEmbed(entry)], flags: MessageFlags.Ephemeral });
    }

    // ban
    await interaction.guild.members.ban(user.id, {
      reason,
      deleteMessageSeconds: (interaction.options.getInteger('purge_days') ?? 0) * 86_400,
    });
    const entry = await logAction(interaction.client, { action: 'ban', ...base });
    return interaction.reply({ embeds: [caseEmbed(entry)], flags: MessageFlags.Ephemeral });
  },
};

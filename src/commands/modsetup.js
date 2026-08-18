import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';
import { config } from '../lib/config.js';
import { updateSettings } from '../lib/settings.js';
import { setupJail, setupMutes, staffRoles, MUTE_KINDS } from '../features/moderation/punishments.js';

const ACTIONS = ['jail', 'unjail', 'mute', 'unmute', 'tempban', 'softban', 'hardban', 'warn', 'kick', 'ban']
  .map((value) => ({ name: value, value }));

export default {
  data: new SlashCommandBuilder()
    .setName('modsetup')
    .setDescription('Create the roles and channels moderation needs')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((s) => s.setName('jail').setDescription('Create the jail role and channel, and lock the role out of everywhere else'))
    .addSubcommand((s) => s.setName('mutes').setDescription('Create the text, image and reaction mute roles'))

    .addSubcommand((s) => s.setName('staff').setDescription('Bind a role as staff, so its holders can use the punish commands')
      .addRoleOption((o) => o.setName('role').setDescription('The role').setRequired(true))
      .addBooleanOption((o) => o.setName('remove').setDescription('Unbind it instead')))

    .addSubcommand((s) => s.setName('invoke').setDescription('Customise what a punishment says')
      .addStringOption((o) => o.setName('action').setDescription('Which command').setRequired(true).addChoices(...ACTIONS))
      .addStringOption((o) => o.setName('where').setDescription('The channel reply, or the DM').setRequired(true)
        .addChoices({ name: 'channel reply', value: 'message' }, { name: 'DM to the member', value: 'dm' }))
      .addStringOption((o) => o.setName('text').setDescription('{user} {moderator} {reason} {duration} — empty resets it')))

    .addSubcommand((s) => s.setName('show').setDescription('What moderation is currently wired to')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const who = interaction.user.username;

    if (sub === 'jail') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await setupJail(interaction.guild, { who });
      return interaction.editReply(
        `✅ Jail ready. ${result.created.length ? `Created ${result.created.join(' and ')}. ` : 'Reused what was already there. '}` +
        `Locked the role out of ${result.touched} channel(s).`
      );
    }

    if (sub === 'mutes') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await setupMutes(interaction.guild, { who });
      return interaction.editReply(
        `✅ Mute roles ready. ${result.created.length ? `Created ${result.created.join(', ')}. ` : 'Reused what was already there. '}` +
        `Applied overwrites ${result.touched} time(s) across your channels.`
      );
    }

    if (sub === 'staff') {
      const role = interaction.options.getRole('role');
      const remove = interaction.options.getBoolean('remove') ?? false;
      const current = new Set(staffRoles());
      remove ? current.delete(role.id) : current.add(role.id);
      updateSettings({ punishments: { staffRoleIds: [...current] } }, { who });
      return interaction.reply({ content: `✅ ${role} ${remove ? 'unbound' : 'bound'} as staff.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'invoke') {
      const action = interaction.options.getString('action');
      const where = interaction.options.getString('where');
      const text = interaction.options.getString('text') ?? '';
      const invoke = { ...(config.punishments?.invoke ?? {}) };
      invoke[action] = { ...(invoke[action] ?? {}), [where]: text };
      updateSettings({ punishments: { invoke } }, { who });
      return interaction.reply({
        content: text ? `✅ \`${action}\` ${where === 'dm' ? 'DM' : 'reply'} set to:\n> ${text}` : `✅ \`${action}\` ${where} reset to the default.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const p = config.punishments ?? {};
    const ref = (id) => (id && /^\d{17,20}$/.test(id) ? `<@&${id}>` : '_not set_');
    const e = embed()
      .setTitle('🛡️ Moderation wiring')
      .addFields(
        { name: 'Jail', value: `${ref(p.jailRoleId)} · ${p.jailChannelId ? `<#${p.jailChannelId}>` : '_no channel_'}` },
        { name: 'Mutes', value: Object.values(MUTE_KINDS).map((spec) => `${spec.label}: ${ref(p[spec.key])}`).join('\n') },
        { name: 'Staff roles', value: staffRoles().length ? staffRoles().map((id) => `<@&${id}>`).join(' ') : '_Manage Server only_' },
        { name: 'Custom wording', value: Object.keys(p.invoke ?? {}).length ? Object.keys(p.invoke).join(', ') : '_defaults everywhere_' }
      );
    return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  },
};

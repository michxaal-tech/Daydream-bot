import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { embed, assertCanPost } from '../lib/brand.js';
import { config } from '../lib/config.js';
import { updateSettings } from '../lib/settings.js';
import { panels, findPanel, renderPanel } from '../features/roles/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rolemenu')
    .setDescription('Panels where members give themselves roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

    .addSubcommand((s) => s.setName('create').setDescription('Make an empty panel')
      .addStringOption((o) => o.setName('id').setDescription('Short name, e.g. notifs').setRequired(true).setMaxLength(30))
      .addStringOption((o) => o.setName('title').setDescription('Heading on the panel'))
      .addStringOption((o) => o.setName('description').setDescription('Line under the heading'))
      .addBooleanOption((o) => o.setName('exclusive').setDescription('Only one role from this panel at a time')))

    .addSubcommand((s) => s.setName('add').setDescription('Add a role to a panel')
      .addStringOption((o) => o.setName('panel').setDescription('Which panel').setRequired(true).setAutocomplete(true))
      .addRoleOption((o) => o.setName('role').setDescription('The role').setRequired(true))
      .addStringOption((o) => o.setName('label').setDescription('Button text (defaults to the role name)'))
      .addStringOption((o) => o.setName('emoji').setDescription('Button emoji — optional'))
      .addStringOption((o) => o.setName('description').setDescription('Note beside it in the list')))

    .addSubcommand((s) => s.setName('remove').setDescription('Take a role off a panel')
      .addStringOption((o) => o.setName('panel').setDescription('Which panel').setRequired(true).setAutocomplete(true))
      .addRoleOption((o) => o.setName('role').setDescription('The role').setRequired(true)))

    .addSubcommand((s) => s.setName('post').setDescription('Post the panel so people can use it')
      .addStringOption((o) => o.setName('panel').setDescription('Which panel').setRequired(true).setAutocomplete(true))
      .addChannelOption((o) => o.setName('channel').setDescription('Where').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))

    .addSubcommand((s) => s.setName('delete').setDescription('Delete a panel')
      .addStringOption((o) => o.setName('panel').setDescription('Which panel').setRequired(true).setAutocomplete(true)))

    .addSubcommand((s) => s.setName('list').setDescription('Every panel')),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      panels()
        .filter((p) => p.id.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((p) => ({ name: `${p.id} — ${p.roles?.length ?? 0} role(s)`, value: p.id }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const who = interaction.user.username;
    const save = (list) => updateSettings({ roleMenus: { panels: list } }, { who });

    if (sub === 'list') {
      const e = embed().setTitle('🎨 Role panels').setDescription(
        panels().length
          ? panels().map((p) => `**${p.id}** — ${p.title || 'untitled'}\n└ ${(p.roles ?? []).map((r) => `<@&${r.roleId}>`).join(' ') || '_no roles yet_'}`).join('\n')
          : 'None yet. Make one with `/rolemenu create`.'
      );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === 'create') {
      const id = interaction.options.getString('id').toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!id) throw new Error('Give the panel a simple id — letters, numbers and dashes.');
      if (findPanel(id)) throw new Error(`A panel called \`${id}\` already exists.`);
      save([...panels(), {
        id,
        title: interaction.options.getString('title') ?? 'Pick your roles',
        description: interaction.options.getString('description') ?? '',
        exclusive: interaction.options.getBoolean('exclusive') ?? false,
        roles: [],
      }]);
      return interaction.reply({ content: `✅ Panel \`${id}\` created. Add roles with \`/rolemenu add\`.`, flags: MessageFlags.Ephemeral });
    }

    const panelId = interaction.options.getString('panel');
    const panel = findPanel(panelId);
    if (!panel) throw new Error(`No panel called \`${panelId}\`.`);

    if (sub === 'add') {
      const role = interaction.options.getRole('role');
      const me = await interaction.guild.members.fetchMe();
      if (role.position >= me.roles.highest.position) {
        throw new Error(`**${role.name}** sits above my own role, so I could never hand it out. Move my role above it first.`);
      }
      if ((panel.roles ?? []).length >= 25) throw new Error('A panel holds at most 25 roles.');

      const roles = [
        ...(panel.roles ?? []).filter((r) => r.roleId !== role.id),
        {
          roleId: role.id,
          label: interaction.options.getString('label') ?? role.name,
          emoji: interaction.options.getString('emoji') ?? '',
          description: interaction.options.getString('description') ?? '',
        },
      ];
      save(panels().map((p) => (p.id === panelId ? { ...p, roles } : p)));
      return interaction.reply({ content: `✅ ${role} added to \`${panelId}\`. Re-post it with \`/rolemenu post\`.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('role');
      const roles = (panel.roles ?? []).filter((r) => r.roleId !== role.id);
      save(panels().map((p) => (p.id === panelId ? { ...p, roles } : p)));
      return interaction.reply({ content: `✅ ${role} removed from \`${panelId}\`.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'delete') {
      save(panels().filter((p) => p.id !== panelId));
      return interaction.reply({ content: `✅ Panel \`${panelId}\` deleted. Any message already posted stops working.`, flags: MessageFlags.Ephemeral });
    }

    // post
    if (!(panel.roles ?? []).length) throw new Error('That panel has no roles on it yet.');
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    assertCanPost(channel, await interaction.guild.members.fetchMe());
    const message = await channel.send(renderPanel(panel));
    return interaction.reply({ content: `✅ Posted in ${channel} — ${message.url}`, flags: MessageFlags.Ephemeral });
  },
};

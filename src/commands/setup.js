import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
} from 'discord.js';
import { config } from '../lib/config.js';
import { updateSettings } from '../lib/settings.js';
import { embed } from '../lib/brand.js';
import { platformIds } from '../features/notifications/platforms/index.js';

/** The channel settings that are just "an id in a slot" — one handler covers all. */
const CHANNEL_SLOTS = {
  welcome: { path: ['welcome', 'channelId'], label: 'Welcome messages' },
  rules: { path: ['welcome', 'rulesChannelId'], label: 'Rules link' },
  intros: { path: ['welcome', 'introsChannelId'], label: 'Intros link' },
  roles: { path: ['welcome', 'rolesChannelId'], label: 'Roles link' },
  goodbye: { path: ['welcome', 'goodbye', 'channelId'], label: 'Goodbye messages' },
  uploads: { path: ['notifications', 'defaultChannelId'], label: 'Upload notifications' },
};

/** Turn ['welcome','channelId'] + value into { welcome: { channelId: value } }. */
const nest = (path, value) =>
  path.reduceRight((acc, key) => ({ [key]: acc }), value);

const ok = (text) => ({
  embeds: [embed().setTitle('✅ Saved').setDescription(text)],
  flags: MessageFlags.Ephemeral,
});

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot without touching any files')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((s) =>
      s
        .setName('channel')
        .setDescription('Point a feature at a channel')
        .addStringOption((o) =>
          o
            .setName('setting')
            .setDescription('Which channel to set')
            .setRequired(true)
            .addChoices(
              ...Object.entries(CHANNEL_SLOTS).map(([value, { label }]) => ({
                name: `${value} — ${label}`,
                value,
              }))
            )
        )
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('The channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )

    .addSubcommand((s) =>
      s
        .setName('welcome')
        .setDescription('Welcome message behaviour')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Greet new members at all'))
        .addBooleanOption((o) => o.setName('ping').setDescription('Actually @-mention the new member'))
        .addBooleanOption((o) => o.setName('dm').setDescription('Also send them a welcome DM'))
        .addBooleanOption((o) => o.setName('goodbye').setDescription('Post a line when someone leaves'))
        .addRoleOption((o) => o.setName('autorole').setDescription('Role to grant on join'))
    )

    .addSubcommand((s) =>
      s
        .setName('greeting')
        .setDescription('Replace the greeting lines (use | between them, {user} for the mention)')
        .addStringOption((o) =>
          o
            .setName('lines')
            .setDescription('welcome {user}! | {user} is member #{count} | hey {user} 👋')
            .setRequired(true)
        )
    )

    .addSubcommand((s) =>
      s
        .setName('watch')
        .setDescription('Start watching a social account')
        .addStringOption((o) =>
          o
            .setName('platform')
            .setDescription('Which platform')
            .setRequired(true)
            .addChoices(...platformIds.map((p) => ({ name: p, value: p })))
        )
        .addStringOption((o) =>
          o
            .setName('handle')
            .setDescription('YouTube: the UC… channel id. Everything else: the @handle')
            .setRequired(true)
        )
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Where to post (defaults to the uploads channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addRoleOption((o) => o.setName('role').setDescription('Role to ping'))
        .addStringOption((o) => o.setName('message').setDescription('Custom line — {roleMention} {author} {title} {url}'))
    )

    .addSubcommand((s) =>
      s
        .setName('unwatch')
        .setDescription('Stop watching an account')
        .addStringOption((o) =>
          o.setName('account').setDescription('Account id').setRequired(true).setAutocomplete(true)
        )
    )

    .addSubcommand((s) =>
      s
        .setName('socials')
        .setDescription('Set the links /socials shows')
        .addStringOption((o) => o.setName('youtube').setDescription('Full URL'))
        .addStringOption((o) => o.setName('tiktok').setDescription('Full URL'))
        .addStringOption((o) => o.setName('x').setDescription('Full URL'))
        .addStringOption((o) => o.setName('instagram').setDescription('Full URL'))
        .addStringOption((o) => o.setName('twitch').setDescription('Full URL'))
        .addStringOption((o) => o.setName('business').setDescription('Business email'))
    )

    .addSubcommand((s) =>
      s
        .setName('colour')
        .setDescription('Change the accent bar on every embed')
        .addStringOption((o) =>
          o.setName('hex').setDescription('e.g. #A78BFA').setRequired(true)
        )
    )

    .addSubcommand((s) => s.setName('show').setDescription('Show the current configuration')),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      (config.notifications?.accounts ?? [])
        .filter((a) => a.id.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((a) => ({ name: `${a.id} — ${a.platform}:${a.handle}`, value: a.id }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const who = `${interaction.user.tag} (${interaction.user.id})`;

    if (sub === 'channel') {
      const slot = CHANNEL_SLOTS[interaction.options.getString('setting')];
      const channel = interaction.options.getChannel('channel');
      updateSettings(nest(slot.path, channel.id), { who });
      return interaction.reply(ok(`**${slot.label}** → ${channel}`));
    }

    if (sub === 'welcome') {
      const patch = { welcome: {} };
      const changes = [];
      const set = (key, value, label) => {
        if (value === null) return;
        patch.welcome[key] = value;
        changes.push(`**${label}** → ${value ? 'on' : 'off'}`);
      };

      set('enabled', interaction.options.getBoolean('enabled'), 'Welcome messages');
      set('pingUser', interaction.options.getBoolean('ping'), 'Ping the member');
      set('sendDm', interaction.options.getBoolean('dm'), 'Welcome DM');

      const goodbye = interaction.options.getBoolean('goodbye');
      if (goodbye !== null) {
        patch.welcome.goodbye = { enabled: goodbye };
        changes.push(`**Goodbye messages** → ${goodbye ? 'on' : 'off'}`);
      }

      const role = interaction.options.getRole('autorole');
      if (role) {
        patch.welcome.autoRoleIds = [role.id];
        changes.push(`**Auto-role** → ${role}`);
        const me = await interaction.guild.members.fetchMe();
        if (role.position >= me.roles.highest.position) {
          changes.push(
            `\n⚠️ ${role} sits above my own role, so I can't actually grant it. ` +
              'Drag my role above it in Server Settings → Roles.'
          );
        }
      }

      if (!changes.length) {
        throw new Error('Nothing to change — pass at least one option.');
      }
      updateSettings(patch, { who });
      return interaction.reply(ok(changes.join('\n')));
    }

    if (sub === 'greeting') {
      const lines = interaction.options
        .getString('lines')
        .split('|')
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) throw new Error('No greeting lines found — separate them with `|`.');
      updateSettings({ welcome: { greetings: lines } }, { who });
      return interaction.reply(
        ok(`${lines.length} greeting line(s) saved:\n${lines.map((l) => `• ${l}`).join('\n')}`)
      );
    }

    if (sub === 'watch') {
      const platform = interaction.options.getString('platform');
      const handle = interaction.options.getString('handle').trim();
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');

      if (platform === 'youtube' && !handle.startsWith('UC')) {
        throw new Error(
          'YouTube needs the channel id, not the @handle — it starts with `UC`. ' +
            'Find it at youtube.com/account_advanced while signed in as the channel.'
        );
      }

      const accounts = [...(config.notifications?.accounts ?? [])];
      const id = uniqueId(platform, handle, accounts);
      const account = {
        id,
        platform,
        handle,
        enabled: true,
        postToChannelId: channel?.id ?? '',
        mentionRoleId: role?.id ?? '',
        template: interaction.options.getString('message') ?? undefined,
        ...(platform === 'youtube' ? { channelId: handle } : {}),
      };

      const existing = accounts.findIndex((a) => a.platform === platform && a.handle === handle);
      if (existing >= 0) accounts[existing] = { ...accounts[existing], ...account, id: accounts[existing].id };
      else accounts.push(account);

      updateSettings({ notifications: { enabled: true, accounts } }, { who });
      return interaction.reply(
        ok(
          [
            `Watching **${platform}** \`${handle}\` as \`${existing >= 0 ? accounts[existing].id : id}\``,
            `Posts to ${channel ?? `<#${config.notifications?.defaultChannelId}>`}`,
            `Pings ${role ?? 'nobody'}`,
            '',
            'Run `/notify test` to check the formatting.',
          ].join('\n')
        )
      );
    }

    if (sub === 'unwatch') {
      const id = interaction.options.getString('account');
      const accounts = (config.notifications?.accounts ?? []).filter((a) => a.id !== id);
      if (accounts.length === (config.notifications?.accounts ?? []).length) {
        throw new Error(`No account with id \`${id}\`.`);
      }
      updateSettings({ notifications: { accounts } }, { who });
      return interaction.reply(ok(`Stopped watching \`${id}\`.`));
    }

    if (sub === 'socials') {
      const patch = {};
      for (const key of ['youtube', 'tiktok', 'x', 'instagram', 'twitch', 'business']) {
        const value = interaction.options.getString(key);
        if (value) patch[key] = value.trim();
      }
      if (!Object.keys(patch).length) throw new Error('Nothing to change — pass at least one link.');
      updateSettings({ socials: patch }, { who });
      return interaction.reply(
        ok(Object.entries(patch).map(([k, v]) => `**${k}** → ${v}`).join('\n'))
      );
    }

    if (sub === 'colour') {
      const raw = interaction.options.getString('hex').trim();
      const hex = raw.startsWith('#') ? raw : `#${raw}`;
      if (!/^#[0-9a-f]{6}$/i.test(hex)) {
        throw new Error(`\`${raw}\` isn't a 6-digit hex colour. Try \`#A78BFA\`.`);
      }
      updateSettings({ brand: { accent: hex } }, { who });
      return interaction.reply({
        embeds: [
          embed()
            .setTitle('✅ Saved')
            .setDescription(`Accent bar → \`${hex}\`. This embed already uses it.`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // show
    const w = config.welcome ?? {};
    const chan = (id) => (id && /^\d{17,20}$/.test(id) ? `<#${id}>` : '_not set_');
    const e = embed()
      .setTitle('⚙️ Current configuration')
      .addFields(
        {
          name: 'Channels',
          value: [
            `Welcome ${chan(w.channelId)}`,
            `Rules ${chan(w.rulesChannelId)}`,
            `Intros ${chan(w.introsChannelId)}`,
            `Roles ${chan(w.rolesChannelId)}`,
            `Uploads ${chan(config.notifications?.defaultChannelId)}`,
          ].join('\n'),
        },
        {
          name: 'Welcome',
          value: [
            `Enabled: ${w.enabled === false ? 'no' : 'yes'}`,
            `Pings the member: ${w.pingUser === false ? 'no' : 'yes'}`,
            `DM: ${w.sendDm ? 'yes' : 'no'}`,
            `Auto-role: ${w.autoRoleIds?.length ? w.autoRoleIds.map((r) => `<@&${r}>`).join(' ') : 'none'}`,
            `Greeting lines: ${w.greetings?.length ?? 0}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Watching',
          value:
            (config.notifications?.accounts ?? [])
              .map((a) => `${a.enabled === false ? '⏸️' : '✅'} ${a.platform} \`${a.handle}\``)
              .join('\n') || '_nothing yet_',
          inline: true,
        },
        { name: 'Accent', value: `\`${config.brand?.accent ?? '#A78BFA'}\`` }
      );
    return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
  },
};

/** yt-main, yt-main-2, … — stable ids so /notify test autocomplete stays useful. */
function uniqueId(platform, handle, accounts) {
  const base = `${platform}-${handle.replace(/^@/, '').toLowerCase()}`.slice(0, 28);
  if (!accounts.some((a) => a.id === base)) return base;
  let n = 2;
  while (accounts.some((a) => a.id === `${base}-${n}`)) n++;
  return `${base}-${n}`;
}

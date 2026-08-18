import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { config } from '../lib/config.js';
import { embed, PLATFORM_META } from '../lib/brand.js';
import { enabledAccounts, runCheck, announce } from '../features/notifications/watcher.js';
import { getPlatform } from '../features/notifications/platforms/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('notify')
    .setDescription('Upload-notification controls')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('list').setDescription('Show every watched account'))
    .addSubcommand((s) => s.setName('check').setDescription('Poll every account right now'))
    .addSubcommand((s) =>
      s
        .setName('test')
        .setDescription('Re-post the latest item from one account, to check the formatting')
        .addStringOption((o) =>
          o.setName('account').setDescription('Account id from /notify list').setRequired(true).setAutocomplete(true)
        )
        .addChannelOption((o) => o.setName('channel').setDescription('Post the test here instead'))
    ),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      enabledAccounts()
        .filter((a) => a.id.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((a) => ({ name: `${a.id} — ${a.platform}:${a.handle}`, value: a.id }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const accounts = config.notifications?.accounts ?? [];
      const e = embed().setTitle('📡 Watched accounts').setDescription(
        accounts.length
          ? accounts
              .map((a) => {
                const meta = PLATFORM_META[a.platform] ?? { emoji: '•', label: a.platform };
                const where = a.webhookUrl ? 'via webhook' : `<#${a.postToChannelId || config.notifications.defaultChannelId}>`;
                const role = a.mentionEveryone ? '@everyone' : a.mentionRoleId ? `<@&${a.mentionRoleId}>` : 'no ping';
                return `${a.enabled === false ? '⏸️' : '✅'} ${meta.emoji} **${a.id}** · \`${a.handle}\`\n └ ${where} · ${role}`;
              })
              .join('\n')
          : 'Nothing configured yet — add entries under `notifications.accounts` in config.json.'
      );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'check') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const found = await runCheck(interaction.client);
      return interaction.editReply(
        found.length
          ? `✅ Announced ${found.length} new post(s): ${found.map((f) => f.account).join(', ')}`
          : '✅ Checked every account — nothing new.'
      );
    }

    // test
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.options.getString('account');
    const account = (config.notifications?.accounts ?? []).find((a) => a.id === id);
    if (!account) throw new Error(`No account with id "${id}".`);

    const posts = await getPlatform(account.platform).fetchLatest(account);
    if (!posts.length) throw new Error(`${account.platform}:${account.handle} returned nothing (offline, or the feed is empty).`);

    const channel = interaction.options.getChannel('channel');
    const latest = posts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];
    await announce(interaction.client, account, latest, channel?.id ?? interaction.channelId);
    return interaction.editReply(`✅ Test posted: **${latest.title}**`);
  },
};

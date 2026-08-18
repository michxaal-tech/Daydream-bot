import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { embed, assertCanPost } from '../lib/brand.js';
import { panel as verifyPanel } from '../features/verification/index.js';
import { panel as ticketPanel, closeTicket, allOpen } from '../features/tickets/index.js';
import { create as schedule, all as scheduled, remove as unschedule, REPEATS } from '../features/scheduler/index.js';
import { parseWhen, discordTimestamp } from '../features/fun/index.js';
import { logAction } from '../features/moderation/cases.js';

export default {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Panels, scheduling and emergency controls')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand((s) => s.setName('verifypanel').setDescription('Post the verification panel')
      .addChannelOption((o) => o.setName('channel').setDescription('Where').addChannelTypes(ChannelType.GuildText)))

    .addSubcommand((s) => s.setName('ticketpanel').setDescription('Post the ticket panel')
      .addChannelOption((o) => o.setName('channel').setDescription('Where').addChannelTypes(ChannelType.GuildText)))

    .addSubcommand((s) => s.setName('closeticket').setDescription('Close a ticket by number')
      .addIntegerOption((o) => o.setName('number').setDescription('Ticket number').setRequired(true)))

    .addSubcommand((s) => s.setName('schedule').setDescription('Post something later, once or on repeat')
      .addStringOption((o) => o.setName('when').setDescription('"in 2 hours", "tomorrow 9pm", "2026-09-01 18:30"').setRequired(true))
      .addStringOption((o) => o.setName('text').setDescription('What to post').setRequired(true).setMaxLength(1500))
      .addStringOption((o) => o.setName('repeat').setDescription('How often').addChoices(
        { name: 'once', value: 'once' }, { name: 'every day', value: 'daily' }, { name: 'every week', value: 'weekly' }))
      .addChannelOption((o) => o.setName('channel').setDescription('Where').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addBooleanOption((o) => o.setName('embed').setDescription('Send it as an embed')))

    .addSubcommand((s) => s.setName('scheduled').setDescription('What is queued up'))

    .addSubcommand((s) => s.setName('unschedule').setDescription('Cancel a scheduled post')
      .addStringOption((o) => o.setName('id').setDescription('Which one').setRequired(true).setAutocomplete(true)))

    .addSubcommand((s) => s.setName('lockdown').setDescription('Panic button — stop everyone posting')
      .addBooleanOption((o) => o.setName('on').setDescription('On or off').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Why'))),

  async autocomplete(interaction) {
    await interaction.respond(
      scheduled().slice(0, 25).map((s) => ({ name: `${s.text.slice(0, 60)} — ${s.repeat}`, value: s.id }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    if (sub === 'verifypanel' || sub === 'ticketpanel') {
      assertCanPost(channel, await interaction.guild.members.fetchMe());
      const message = await channel.send(sub === 'verifypanel' ? verifyPanel() : ticketPanel());
      return interaction.reply({ content: `✅ Posted in ${channel} — ${message.url}`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'closeticket') {
      const ticket = await closeTicket(interaction.client, interaction.options.getInteger('number'), interaction.user.username);
      return interaction.reply({ content: `✅ Closed ticket #${ticket.id}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'schedule') {
      const when = parseWhen(interaction.options.getString('when'));
      if (!when) throw new Error('I could not read that time. Try `in 2 hours`, `tomorrow 9pm`, or `2026-09-01 18:30`.');
      if (when.getTime() < Date.now() - 60_000) throw new Error('That time has already passed.');

      const entry = schedule({
        channelId: channel.id,
        text: interaction.options.getString('text'),
        at: when.getTime(),
        repeat: interaction.options.getString('repeat') ?? 'once',
        asEmbed: interaction.options.getBoolean('embed') ?? false,
        authorTag: interaction.user.username,
      });
      return interaction.reply({
        content: `🗓️ Queued for ${discordTimestamp(when, 'F')} (${discordTimestamp(when, 'R')})${entry.repeat !== 'once' ? `, repeating ${entry.repeat}` : ''}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'scheduled') {
      const list = scheduled().slice(0, 15);
      const e = embed().setTitle('🗓️ Scheduled posts').setDescription(
        list.length
          ? list.map((s) => `**#${s.id}** <#${s.channelId}> · ${s.repeat}\n└ ${s.text.slice(0, 70)} — ${discordTimestamp(new Date(s.at), 'R')}`).join('\n')
          : 'Nothing queued. Add one with `/server schedule`.'
      );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'unschedule') {
      unschedule(interaction.options.getString('id'));
      return interaction.reply({ content: '✅ Cancelled.', flags: MessageFlags.Ephemeral });
    }

    // lockdown
    const on = interaction.options.getBoolean('on');
    const reason = interaction.options.getString('reason') ?? 'raid protection';
    const everyone = interaction.guild.roles.everyone;
    let changed = 0;

    for (const ch of interaction.guild.channels.cache.values()) {
      if (ch.type !== ChannelType.GuildText) continue;
      await ch.permissionOverwrites.edit(everyone, { SendMessages: on ? false : null }, { reason })
        .then(() => changed++)
        .catch(() => {});
    }

    await logAction(interaction.client, {
      action: 'automod',
      userId: interaction.user.id,
      userTag: interaction.user.username,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.username,
      reason: `Server ${on ? 'locked down' : 'unlocked'} — ${reason}`,
    });

    return interaction.reply({
      content: `${on ? '🔒 Locked' : '🔓 Unlocked'} ${changed} channel(s). ${on ? 'Run it again with on:false to lift it.' : ''}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

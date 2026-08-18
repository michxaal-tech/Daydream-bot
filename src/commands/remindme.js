import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';
import { parseDuration, create, schedule, listFor, cancel } from '../features/reminders/index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remindme')
    .setDescription('Get a nudge later')

    .addSubcommand((s) => s.setName('set').setDescription('Set a reminder')
      .addStringOption((o) => o.setName('when').setDescription('e.g. 30m, 2h, 3 days').setRequired(true))
      .addStringOption((o) => o.setName('what').setDescription('What about?').setRequired(true).setMaxLength(400))
      .addBooleanOption((o) => o.setName('dm').setDescription('Send it as a DM instead of here')))

    .addSubcommand((s) => s.setName('list').setDescription('Your reminders'))

    .addSubcommand((s) => s.setName('cancel').setDescription('Cancel one')
      .addStringOption((o) => o.setName('reminder').setDescription('Which one').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction) {
    await interaction.respond(
      listFor(interaction.user.id).slice(0, 25).map((r) => ({ name: r.text.slice(0, 90), value: r.id }))
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const ms = parseDuration(interaction.options.getString('when'));
      if (!ms) throw new Error("I couldn't read that time. Try something like `30m`, `2h` or `3 days`.");
      if (ms > 365 * 86_400_000) throw new Error('A year is as far ahead as I go.');

      const reminder = create({
        userId: interaction.user.id,
        channelId: interaction.channelId,
        text: interaction.options.getString('what'),
        dueAt: Date.now() + ms,
        dm: interaction.options.getBoolean('dm') ?? false,
      });
      schedule(interaction.client, reminder);
      return interaction.reply({
        content: `⏰ I'll remind you <t:${Math.floor(reminder.dueAt / 1000)}:R>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'cancel') {
      cancel(interaction.options.getString('reminder'));
      return interaction.reply({ content: '✅ Cancelled.', flags: MessageFlags.Ephemeral });
    }

    const mine = listFor(interaction.user.id);
    const e = embed().setTitle('⏰ Your reminders').setDescription(
      mine.length
        ? mine.map((r) => `**${r.text}**\n└ <t:${Math.floor(r.dueAt / 1000)}:R>`).join('\n')
        : 'None set. Try `/remindme set when:2h what:post the edit`.'
    );
    return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
  },
};

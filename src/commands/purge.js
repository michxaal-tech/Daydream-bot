import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk-delete recent messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName('count').setDescription('How many to look at (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('from').setDescription('Only this member\'s messages'))
    .addStringOption((o) => o.setName('contains').setDescription('Only messages containing this text')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const count = interaction.options.getInteger('count');
    const from = interaction.options.getUser('from');
    const contains = interaction.options.getString('contains')?.toLowerCase();

    const fetched = await interaction.channel.messages.fetch({ limit: count });
    // Discord refuses to bulk-delete anything older than 14 days.
    const cutoff = Date.now() - 14 * 86_400_000;
    const targets = [...fetched.values()].filter((m) =>
      m.createdTimestamp > cutoff &&
      (!from || m.author.id === from.id) &&
      (!contains || (m.content ?? '').toLowerCase().includes(contains))
    );

    if (!targets.length) {
      return interaction.editReply('Nothing matched — or everything matching was over 14 days old, which Discord won\'t bulk-delete.');
    }

    const deleted = await interaction.channel.bulkDelete(targets, true);
    const skipped = targets.length - deleted.size;
    return interaction.editReply(
      `🧹 Deleted ${deleted.size} message(s)${skipped ? `. ${skipped} were too old to remove this way.` : '.'}`
    );
  },
};

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { embed, assertCanPost } from '../lib/brand.js';
import { config } from '../lib/config.js';
import { createSuggestion, setSuggestionStatus, openSuggestions, postConfession, countingState } from '../features/community/index.js';
import { setBirthday, removeBirthday, getBirthday, upcomingBirthdays } from '../features/profiles/index.js';
import { setAfk } from '../features/profiles/index.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  .map((name, i) => ({ name, value: i + 1 }));

export default {
  data: new SlashCommandBuilder()
    .setName('community')
    .setDescription('Suggestions, confessions, birthdays and AFK')

    .addSubcommandGroup((g) => g.setName('suggest').setDescription('Suggestions')
      .addSubcommand((s) => s.setName('new').setDescription('Put an idea to the server')
        .addStringOption((o) => o.setName('idea').setDescription('What should change?').setRequired(true).setMaxLength(1500))
        .addBooleanOption((o) => o.setName('anonymous').setDescription('Hide your name on the post')))
      .addSubcommand((s) => s.setName('status').setDescription('Mark a suggestion (staff)')
        .addIntegerOption((o) => o.setName('number').setDescription('Suggestion number').setRequired(true))
        .addStringOption((o) => o.setName('status').setDescription('New status').setRequired(true)
          .addChoices({ name: 'Approved', value: 'approved' }, { name: 'Declined', value: 'declined' }, { name: 'Done', value: 'done' }))
        .addStringOption((o) => o.setName('note').setDescription('A line back to whoever suggested it')))
      .addSubcommand((s) => s.setName('list').setDescription('Suggestions still open')))

    .addSubcommand((s) => s.setName('confess').setDescription('Post something anonymously')
      .addStringOption((o) => o.setName('text').setDescription('What do you want to say?').setRequired(true).setMaxLength(1500)))

    .addSubcommandGroup((g) => g.setName('birthday').setDescription('Birthdays')
      .addSubcommand((s) => s.setName('set').setDescription('Save your birthday — no year, no age')
        .addIntegerOption((o) => o.setName('month').setDescription('Month').setRequired(true).addChoices(...MONTHS))
        .addIntegerOption((o) => o.setName('day').setDescription('Day').setRequired(true).setMinValue(1).setMaxValue(31)))
      .addSubcommand((s) => s.setName('remove').setDescription('Forget my birthday'))
      .addSubcommand((s) => s.setName('list').setDescription('Whose birthday is next')))

    .addSubcommand((s) => s.setName('afk').setDescription('Tell people you\'re away')
      .addStringOption((o) => o.setName('reason').setDescription('Why, briefly')))

    .addSubcommand((s) => s.setName('counting').setDescription('How the counting game is going')),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === 'suggest') {
      if (sub === 'new') {
        const cfg = config.suggestions ?? {};
        if (!cfg.enabled) throw new Error('Suggestions are switched off on this server.');
        const channel = await interaction.client.channels.fetch(cfg.channelId).catch(() => null);
        if (!channel?.isTextBased()) throw new Error('No suggestion channel is set.');
        assertCanPost(channel, await interaction.guild.members.fetchMe());

        const { suggestion, message } = await createSuggestion(channel, {
          text: interaction.options.getString('idea'),
          author: { id: interaction.user.id, tag: interaction.user.username },
          anonymous: interaction.options.getBoolean('anonymous') ?? false,
        });
        return interaction.reply({ content: `✅ Posted as suggestion **#${suggestion.id}** — ${message.url}`, flags: MessageFlags.Ephemeral });
      }

      if (sub === 'status') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
          throw new Error('Only staff can change a suggestion\'s status.');
        }
        const updated = await setSuggestionStatus(
          interaction.client,
          interaction.options.getInteger('number'),
          interaction.options.getString('status'),
          interaction.options.getString('note') ?? ''
        );
        return interaction.reply({ content: `✅ Suggestion #${updated.id} marked **${updated.status}**.`, flags: MessageFlags.Ephemeral });
      }

      const open = openSuggestions().slice(0, 10);
      const e = embed().setTitle('💡 Open suggestions').setDescription(
        open.length
          ? open.map((s) => `**#${s.id}** ${s.text.slice(0, 90)}${s.text.length > 90 ? '…' : ''}\n└ 👍 ${s.up.length} · 👎 ${s.down.length}`).join('\n')
          : 'Nothing open. Add one with `/community suggest new`.'
      );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    if (group === 'birthday') {
      if (sub === 'set') {
        const value = setBirthday(interaction.user.id, interaction.options.getInteger('month'), interaction.options.getInteger('day'));
        return interaction.reply({ content: `🎂 Saved — ${value}. No year stored, so nobody learns your age.`, flags: MessageFlags.Ephemeral });
      }
      if (sub === 'remove') {
        removeBirthday(interaction.user.id);
        return interaction.reply({ content: '✅ Forgotten.', flags: MessageFlags.Ephemeral });
      }
      const upcoming = upcomingBirthdays(10);
      const e = embed().setTitle('🎂 Birthdays coming up').setDescription(
        upcoming.length
          ? upcoming.map((b) => `<@${b.userId}> — ${b.value}${b.distance === 0 ? ' · **today**' : ''}`).join('\n')
          : 'Nobody has saved one yet.'
      );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === 'confess') {
      const result = await postConfession(interaction.client, {
        text: interaction.options.getString('text'),
        author: { id: interaction.user.id, tag: interaction.user.username },
      });
      return interaction.reply({ content: `✅ Posted anonymously as #${result.id} — ${result.url}`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'afk') {
      if (!config.afk?.enabled) throw new Error('AFK is switched off on this server.');
      setAfk(interaction.user.id, interaction.options.getString('reason') ?? 'away');
      return interaction.reply({ content: "✅ You're marked AFK. I'll clear it the next time you speak.", flags: MessageFlags.Ephemeral });
    }

    // counting
    const state = countingState();
    const e = embed().setTitle('🔢 Counting').addFields(
      { name: 'Currently at', value: String(state.current), inline: true },
      { name: 'Best ever', value: String(state.best ?? 0), inline: true }
    );
    return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
  },
};

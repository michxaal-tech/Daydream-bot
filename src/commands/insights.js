import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { embed } from '../lib/brand.js';
import { activityGrid, bestSlots, attribution, invitePerformance, superfans } from '../features/analytics/index.js';
import { buildRecap } from '../features/analytics/recap.js';
import { leaderboard } from '../features/levels/index.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLOCKS = [' ', '░', '▒', '▓', '█'];

/** A 7×24 heatmap that survives Discord's proportional font, inside a code block. */
function renderGrid(grid) {
  const peak = Math.max(1, ...grid.flat());
  const header = `     ${Array.from({ length: 24 }, (_, h) => (h % 6 === 0 ? String(h).padStart(2, '0') : '  ')).join('').slice(0, 24)}`;
  const rows = grid.map((row, day) =>
    `${DAYS[day]}  ${row.map((v) => BLOCKS[Math.min(BLOCKS.length - 1, Math.ceil((v / peak) * (BLOCKS.length - 1)))]).join('')}`
  );
  return ['```', header, ...rows, '```'].join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('insights')
    .setDescription('What the numbers say about your server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('radar').setDescription('When your server is actually awake'))
    .addSubcommand((s) => s.setName('attribution').setDescription('Which uploads brought people in'))
    .addSubcommand((s) => s.setName('superfans').setDescription('Your most invested members'))
    .addSubcommand((s) => s.setName('invites').setDescription('Which invite links are working'))
    .addSubcommand((s) => s.setName('recap').setDescription('Preview this week\'s digest')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'radar') {
      const grid = activityGrid();
      const slots = bestSlots(grid, 3);
      const e = embed()
        .setTitle('📡 Drop radar')
        .setDescription(`Messages per hour over the last four weeks, all times UTC.\n${renderGrid(grid)}`)
        .addFields({
          name: 'Busiest slots',
          value: slots.length ? slots.map((s, i) => `${i + 1}. **${s.label}** — ${s.value} messages`).join('\n') : 'Not enough data yet — give it a few days.',
        });
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'attribution') {
      const rows = attribution().slice(0, 8);
      const e = embed()
        .setTitle('📈 Uploads → joins')
        .setDescription(
          rows.length
            ? rows.map((r) => `**${r.joins}** join${r.joins === 1 ? '' : 's'} · [${r.title.slice(0, 55)}](${r.url})\n└ <t:${Math.floor(r.at / 1000)}:R>${r.topInvite && r.topInvite !== 'unknown' ? ` · mostly \`${r.topInvite}\`` : ''}`).join('\n')
            : 'No uploads recorded yet.'
        )
        .setFooter({ text: 'Joins inside the window after each upload — a signal, not proof.' });
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'superfans') {
      const xp = Object.fromEntries(leaderboard(100).map((r) => [r.userId, { xp: r.xp }]));
      const rows = superfans(xp, 10);
      const e = embed()
        .setTitle('💜 Most invested')
        .setDescription(
          rows.length
            ? rows.map((r, i) => `${['🥇', '🥈', '🥉'][i] ?? `**${i + 1}.**`} <@${r.userId}> — **${r.score}**\n└ ${[r.firstHour && `${r.firstHour} early`, r.stars && `${r.stars} stars`, r.giveaways && `${r.giveaways} entries`, r.xp && `${r.xp.toLocaleString()} xp`].filter(Boolean).join(' · ') || 'just getting started'}`).join('\n')
            : 'Nobody has registered any engagement yet.'
        )
        .setFooter({ text: 'Weighted toward things people chose to do, not just talking.' });
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }

    if (sub === 'invites') {
      const rows = invitePerformance().slice(0, 10);
      const e = embed().setTitle('🔗 Invite performance').setDescription(
        rows.length
          ? rows.map((r) => `\`${r.code}\` — **${r.joins}** join${r.joins === 1 ? '' : 's'}${r.inviterTag ? ` · from ${r.inviterTag}` : ''}`).join('\n')
          : 'No joins tracked yet. Turn on invite tracking in the dashboard.'
      );
      return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({
      embeds: [buildRecap({ guildName: interaction.guild.name })],
      flags: MessageFlags.Ephemeral,
    });
  },
};

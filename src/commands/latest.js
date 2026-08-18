import { SlashCommandBuilder } from 'discord.js';
import { config } from '../lib/config.js';
import { getPlatform, platformIds } from '../features/notifications/platforms/index.js';
import { renderEmbed, renderButtons } from '../features/notifications/render.js';

export default {
  data: new SlashCommandBuilder()
    .setName('latest')
    .setDescription('Pull up the most recent post from a platform')
    .addStringOption((o) =>
      o
        .setName('platform')
        .setDescription('Which platform')
        .setRequired(true)
        .addChoices(...platformIds.map((p) => ({ name: p, value: p })))
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const platform = interaction.options.getString('platform');
    const account = (config.notifications?.accounts ?? []).find((a) => a.platform === platform);
    if (!account) throw new Error(`No ${platform} account is configured.`);

    const posts = await getPlatform(platform).fetchLatest(account);
    if (!posts.length) throw new Error(`Nothing to show for ${platform} right now.`);

    const latest = posts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];
    return interaction.editReply({
      embeds: [renderEmbed(account, latest)],
      components: renderButtons(account, latest),
    });
  },
};

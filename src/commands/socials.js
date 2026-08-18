import { SlashCommandBuilder, ActionRowBuilder } from 'discord.js';
import { config } from '../lib/config.js';
import { embed, linkButton, PLATFORM_META } from '../lib/brand.js';

const ORDER = ['youtube', 'tiktok', 'x', 'instagram', 'twitch'];

export default {
  data: new SlashCommandBuilder()
    .setName('socials')
    .setDescription('Every link, in one place'),

  async execute(interaction) {
    const socials = config.socials ?? {};
    const listed = ORDER.filter((k) => socials[k]);

    const e = embed()
      .setTitle(`${config.brand?.name ?? 'The'} — everywhere else`)
      .setDescription(
        listed
          .map((k) => `${PLATFORM_META[k]?.emoji ?? '🔗'} **${PLATFORM_META[k]?.label ?? k}** → ${socials[k]}`)
          .join('\n') || 'No links configured yet.'
      );
    if (socials.business) e.addFields({ name: 'Business enquiries', value: socials.business });

    const row = new ActionRowBuilder().addComponents(
      listed.slice(0, 5).map((k) =>
        linkButton({ label: PLATFORM_META[k]?.label ?? k, url: socials[k], emoji: PLATFORM_META[k]?.emoji })
      )
    );

    return interaction.reply({ embeds: [e], components: listed.length ? [row] : [] });
  },
};

import { Events } from 'discord.js';
import { config } from '../lib/config.js';
import { embed } from '../lib/brand.js';
import { handleMemberName } from '../features/triggers/index.js';
import { logger } from '../lib/logger.js';

const log = logger('boosts');

export default {
  name: Events.GuildMemberUpdate,
  async execute(before, after) {
    await handleMemberName(after).catch(() => {});

    const cfg = config.boosts ?? {};
    const started = !before.premiumSince && after.premiumSince;
    if (!cfg.enabled || !started) return;

    if (/^\d{17,20}$/.test(cfg.roleId ?? '')) {
      await after.roles.add(cfg.roleId, 'server boost').catch(() => {});
    }
    if (!/^\d{17,20}$/.test(cfg.channelId ?? '')) return;

    const channel = await after.client.channels.fetch(cfg.channelId).catch(() => null);
    await channel?.send({
      content: `<@${after.id}>`,
      embeds: [
        embed({ variant: 'deep' })
          .setTitle('💎 Thank you for the boost')
          .setDescription(
            (cfg.template ?? '{user} just boosted the server. That genuinely helps — thank you.')
              .replaceAll('{user}', `<@${after.id}>`)
              .replaceAll('{count}', String(after.guild.premiumSubscriptionCount ?? 0))
          ),
      ],
      allowedMentions: { users: [after.id] },
    }).catch((err) => log.warn('boost thank-you failed:', err.message));
  },
};

import { Events } from 'discord.js';
import { handleMessage as levels } from '../features/levels/index.js';
import { handleMessage as automod } from '../features/moderation/automod.js';
import { handleMessage as channelRules } from '../features/autochannel/index.js';
import { handleCounting } from '../features/community/index.js';
import { afkNotices } from '../features/profiles/index.js';
import { recordMessage } from '../features/analytics/index.js';

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author?.bot || !message.guild) return;

    // Automod first — a message about to be deleted shouldn't earn XP or count.
    await automod(message);
    if (message.deleted) return;

    recordMessage();

    const afk = afkNotices(message);
    const lines = [afk.back, ...afk.mentioned].filter(Boolean);
    if (lines.length) {
      await message.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } }).catch(() => {});
    }

    await Promise.all([levels(message), handleCounting(message), channelRules(message)]);
  },
};

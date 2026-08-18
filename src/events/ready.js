import { ActivityType, Events } from 'discord.js';
import { logger } from '../lib/logger.js';
import { startWatcher, enabledAccounts } from '../features/notifications/watcher.js';

const log = logger('bot');

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    log.info(`logged in as ${client.user.tag} — ${client.guilds.cache.size} guild(s)`);
    client.user.setPresence({
      activities: [{ name: 'for new uploads 👀', type: ActivityType.Watching }],
      status: 'online',
    });
    client.stopWatcher = startWatcher(client);
    log.info(`tracking: ${enabledAccounts().map((a) => `${a.platform}:${a.handle}`).join(', ') || 'nothing yet'}`);
  },
};

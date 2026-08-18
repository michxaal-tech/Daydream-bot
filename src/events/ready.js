import { ActivityType, Events } from 'discord.js';
import { logger } from '../lib/logger.js';
import { env } from '../lib/config.js';
import { registerCommands } from '../lib/register-commands.js';
import { startWatcher, enabledAccounts } from '../features/notifications/watcher.js';
import { startDashboard } from '../web/server.js';
import { restoreOpenPolls } from '../features/polls/index.js';

const log = logger('bot');

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    log.info(`logged in as ${client.user.tag} — ${client.guilds.cache.size} guild(s)`);
    client.user.setPresence({
      activities: [{ name: 'for new uploads 👀', type: ActivityType.Watching }],
      status: 'online',
    });
    if (env.autoDeployCommands) {
      // Lets the bot run on hosts with no terminal — no `npm run deploy` step.
      await registerCommands(client.rest, [...client.commands.values()]).catch((err) =>
        log.error('command registration failed — commands may be stale:', err.message)
      );
    }

    client.stopWatcher = startWatcher(client);
    client.stopDashboard = startDashboard(client);
    restoreOpenPolls(client);
    log.info(`tracking: ${enabledAccounts().map((a) => `${a.platform}:${a.handle}`).join(', ') || 'nothing yet'}`);
  },
};

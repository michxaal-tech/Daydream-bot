import { ActivityType, Events } from 'discord.js';
import { logger } from '../lib/logger.js';
import { env } from '../lib/config.js';
import { registerCommands } from '../lib/register-commands.js';
import { startWatcher, enabledAccounts } from '../features/notifications/watcher.js';
import { startDashboard } from '../web/server.js';
import { restore as restoreGiveaways } from '../features/giveaways/index.js';
import { restore as restoreReminders } from '../features/reminders/index.js';
import { announceBirthdays, clearBirthdayRoles } from '../features/profiles/index.js';
import { updateCounters } from '../features/autochannel/index.js';
import { snapshotInvites } from '../features/logging/index.js';
import { maybePostRecap } from '../features/analytics/recap.js';
import { prune } from '../features/analytics/index.js';
import { runDue, postDailyPrompt } from '../features/scheduler/index.js';
import { restoreTempbans } from '../features/moderation/punishments.js';

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
    restoreGiveaways(client);
    restoreReminders(client);
    restoreTempbans(client);

    for (const guild of client.guilds.cache.values()) {
      await snapshotInvites(guild).catch(() => {});
    }

    // One slow tick drives everything that only needs checking now and then.
    // Channel renames in particular are rate-limited to twice per 10 minutes.
    const tick = async () => {
      await announceBirthdays(client).catch((e) => log.warn('birthdays:', e.message));
      await clearBirthdayRoles(client).catch(() => {});
      await updateCounters(client).catch((e) => log.warn('counters:', e.message));
      await maybePostRecap(client).catch((e) => log.warn('recap:', e.message));
      await runDue(client).catch((e) => log.warn('scheduler:', e.message));
      await postDailyPrompt(client).catch((e) => log.warn('daily prompt:', e.message));
      prune();
    };
    tick();
    const slowTimer = setInterval(tick, 10 * 60_000);
    slowTimer.unref?.();

    // Scheduled posts are time-sensitive in a way birthdays are not.
    const fastTimer = setInterval(
      () => runDue(client).catch((e) => log.warn('scheduler:', e.message)),
      60_000
    );
    fastTimer.unref?.();
    client.stopSlowTick = () => { clearInterval(slowTimer); clearInterval(fastTimer); };
    log.info(`tracking: ${enabledAccounts().map((a) => `${a.platform}:${a.handle}`).join(', ') || 'nothing yet'}`);
  },
};

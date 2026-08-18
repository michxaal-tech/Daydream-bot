import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { env, assertEnv } from './lib/config.js';
import { logger } from './lib/logger.js';
import { loadCommands, loadEvents } from './lib/loaders.js';

const log = logger('bot');
assertEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // Privileged — enable "Server Members Intent" in the Developer Portal or
    // guildMemberAdd never fires and the welcome feature stays silent.
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.GuildMember, Partials.Channel],
});

client.commands = new Collection();
for (const command of await loadCommands()) {
  client.commands.set(command.data.name, command);
}
log.info(`loaded ${client.commands.size} command(s): ${[...client.commands.keys()].join(', ')}`);

for (const event of await loadEvents()) {
  const bind = event.once ? client.once.bind(client) : client.on.bind(client);
  bind(event.name, (...args) =>
    Promise.resolve(event.execute(...args)).catch((err) =>
      log.error(`event ${event.name} threw:`, err)
    )
  );
}

process.on('unhandledRejection', (err) => log.error('unhandled rejection:', err));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log.info(`${signal} — shutting down`);
    client.stopWatcher?.();
    client.destroy();
    process.exit(0);
  });
}

await client.login(env.token);

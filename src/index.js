import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { env, assertEnv } from './lib/config.js';
import { loadSettings } from './lib/settings.js';
import { logger } from './lib/logger.js';
import { loadCommands, loadEvents } from './lib/loaders.js';

const log = logger('bot');
assertEnv();

// Runtime settings sit on top of config.json — load before anything reads it.
loadSettings();

const intents = [
  GatewayIntentBits.Guilds,
  // Privileged — enable "Server Members Intent" in the Developer Portal or
  // guildMemberAdd never fires and the welcome feature stays silent.
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildInvites,
];

// Also privileged, and asking for one you haven't enabled makes login fail —
// so this is opt-in from both sides. Without it automod sees empty message
// text and its content rules simply never match.
if (env.messageContent) {
  intents.push(GatewayIntentBits.MessageContent);
  log.info('Message Content intent requested — automod content rules are active');
} else {
  log.info('Message Content intent off — automod content rules are inactive (set ENABLE_MESSAGE_CONTENT=true)');
}

const client = new Client({
  intents,
  partials: [Partials.GuildMember, Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
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
    client.stopDashboard?.();
    client.stopSlowTick?.();
    client.destroy();
    process.exit(0);
  });
}

await client.login(env.token);

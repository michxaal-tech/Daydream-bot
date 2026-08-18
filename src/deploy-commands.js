/**
 * Manual command registration: `npm run deploy`.
 *
 * You only need this if you turned AUTO_DEPLOY_COMMANDS off — the bot registers
 * its own commands on startup by default.
 */
import { REST } from 'discord.js';
import { env, assertEnv } from './lib/config.js';
import { loadCommands } from './lib/loaders.js';
import { registerCommands } from './lib/register-commands.js';

assertEnv();
await registerCommands(new REST().setToken(env.token), await loadCommands());

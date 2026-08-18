/**
 * Registers slash commands. Guild-scoped registration is instant, which is what
 * you want while iterating; drop DISCORD_GUILD_ID to publish globally (~1h).
 */
import { REST, Routes } from 'discord.js';
import { env, assertEnv } from './lib/config.js';
import { logger } from './lib/logger.js';
import { loadCommands } from './lib/loaders.js';

const log = logger('deploy');
assertEnv();

const body = (await loadCommands()).map((c) => c.data.toJSON());
const rest = new REST().setToken(env.token);

const route = env.guildId
  ? Routes.applicationGuildCommands(env.clientId, env.guildId)
  : Routes.applicationCommands(env.clientId);

const data = await rest.put(route, { body });
log.info(`registered ${data.length} command(s) ${env.guildId ? `to guild ${env.guildId}` : 'globally'}`);

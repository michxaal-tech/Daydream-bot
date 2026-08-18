/**
 * Slash-command registration, shared by `npm run deploy` and the boot-time
 * auto-register. Hosts like Railway give you no terminal, so the bot has to be
 * able to publish its own commands on startup.
 *
 * Registration is a PUT — it replaces the whole set, so running it every boot
 * is idempotent, not additive.
 */
import { Routes } from 'discord.js';
import { env } from './config.js';
import { logger } from './logger.js';

const log = logger('deploy');

export async function registerCommands(rest, commands) {
  const body = commands.map((c) => c.data.toJSON());
  const route = env.guildId
    ? Routes.applicationGuildCommands(env.clientId, env.guildId)
    : Routes.applicationCommands(env.clientId);

  const data = await rest.put(route, { body });
  log.info(
    `registered ${data.length} command(s) ${
      env.guildId ? `to guild ${env.guildId} (instant)` : 'globally (~1h to appear)'
    }`
  );
  return data;
}

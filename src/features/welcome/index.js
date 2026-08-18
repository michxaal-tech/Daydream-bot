import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { buildWelcome, buildWelcomeDm, buildGoodbye } from './render.js';

const log = logger('welcome');

function resolveChannel(guild, id) {
  if (!id || /^[A-Z_]+$/.test(id)) return null; // placeholder left in config.json
  return guild.channels.cache.get(id) ?? null;
}

/** Post the welcome message that pings the member in #welcome. */
export async function sendWelcome(member, { channelId = null, silent = false } = {}) {
  const cfg = config.welcome ?? {};
  const channel =
    resolveChannel(member.guild, channelId ?? cfg.channelId) ??
    member.guild.channels.cache.find((c) => c.name === 'welcome' && c.isTextBased());

  if (!channel?.isTextBased()) {
    log.warn(`no welcome channel resolved (configured: ${cfg.channelId ?? 'none'})`);
    return null;
  }

  const payload = buildWelcome(member, { cfg });
  if (silent) payload.allowedMentions = { parse: [] };

  const message = await channel.send(payload);

  for (const emoji of cfg.reactWith ?? []) {
    await message.react(emoji).catch(() => {});
  }
  if (cfg.deleteAfterSeconds > 0) {
    setTimeout(() => message.delete().catch(() => {}), cfg.deleteAfterSeconds * 1000).unref?.();
  }
  return message;
}

/** Everything that should happen when someone joins. */
export async function handleJoin(member) {
  const cfg = config.welcome ?? {};
  if (cfg.enabled === false) return;
  if (member.user.bot) return;

  try {
    await sendWelcome(member);
  } catch (err) {
    log.error(`welcome message failed for ${member.user.tag}:`, err.message);
  }

  const roles = (cfg.autoRoleIds ?? []).filter((id) => /^\d{17,20}$/.test(id));
  if (roles.length) {
    await member.roles
      .add(roles, 'auto-role on join')
      .catch((e) => log.warn(`auto-role failed for ${member.user.tag}:`, e.message));
  }

  if (cfg.sendDm) {
    await member
      .send(buildWelcomeDm(member, { cfg }))
      .catch(() => log.debug(`${member.user.tag} has DMs closed — skipped`));
  }
}

export async function handleLeave(member) {
  const cfg = config.welcome ?? {};
  if (!cfg.goodbye?.enabled) return;
  const channel =
    resolveChannel(member.guild, cfg.goodbye.channelId || cfg.channelId) ?? null;
  if (!channel?.isTextBased()) return;
  await channel.send(buildGoodbye(member, { cfg })).catch((e) => log.warn(e.message));
}

export { buildWelcome, buildWelcomeDm, buildGoodbye };

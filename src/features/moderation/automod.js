/**
 * Automod.
 *
 * Rules are deliberately boring and explainable — a member who gets filtered
 * should be able to tell which line they crossed. Each rule returns a reason
 * string or null, and the first hit wins.
 *
 * Content-based rules need the Message Content intent. Without it Discord
 * delivers an empty `content`, so those rules simply never fire rather than
 * misbehaving — see ENABLE_MESSAGE_CONTENT in .env.example.
 */
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { logAction, warningCount } from './cases.js';

const log = logger('automod');

const INVITE = /(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
const LINK = /https?:\/\/\S+/i;

/** Every rule, in the order they're checked. */
export const RULES = [
  {
    id: 'invites',
    label: 'Discord invite links',
    test: (message, cfg) => (cfg.blockInvites && INVITE.test(message.content) ? 'posted a Discord invite' : null),
  },
  {
    id: 'links',
    label: 'Any links',
    test: (message, cfg) => (cfg.blockLinks && LINK.test(message.content) ? 'posted a link' : null),
  },
  {
    id: 'mentions',
    label: 'Mass mentions',
    test: (message, cfg) => {
      const limit = cfg.maxMentions ?? 0;
      if (!limit) return null;
      const count = (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0);
      return count > limit ? `mentioned ${count} people or roles at once` : null;
    },
  },
  {
    id: 'caps',
    label: 'Shouting',
    test: (message, cfg) => {
      const threshold = cfg.maxCapsPercent ?? 0;
      const text = message.content ?? '';
      if (!threshold || text.length < 12) return null;
      const letters = text.replace(/[^a-z]/gi, '');
      if (letters.length < 10) return null;
      const caps = letters.replace(/[^A-Z]/g, '').length;
      return (caps / letters.length) * 100 > threshold ? 'wrote mostly in capitals' : null;
    },
  },
  {
    id: 'words',
    label: 'Blocked words',
    test: (message, cfg) => {
      const words = (cfg.blockedWords ?? []).map((w) => w.toLowerCase().trim()).filter(Boolean);
      if (!words.length) return null;
      const text = (message.content ?? '').toLowerCase();
      const hit = words.find((w) => text.includes(w));
      return hit ? 'used a blocked word' : null;
    },
  },
  {
    id: 'spam',
    label: 'Repeated messages',
    test: (message, cfg, memory) => {
      if (!cfg.blockRepeats) return null;
      const key = `${message.author.id}`;
      const previous = memory.get(key);
      memory.set(key, { text: message.content, at: Date.now() });
      if (!previous || !message.content) return null;
      const withinWindow = Date.now() - previous.at < 15_000;
      return withinWindow && previous.text === message.content ? 'repeated the same message' : null;
    },
  },
];

const recent = new Map();

/** Is this member exempt? Staff and whitelisted roles never get filtered. */
function exempt(message, cfg) {
  if (!message.member) return true;
  if (message.member.permissions?.has?.('ManageMessages')) return true;
  const allowed = cfg.exemptRoleIds ?? [];
  return allowed.some((roleId) => message.member.roles?.cache?.has(roleId));
}

/** Returns the reason a message should be removed, or null to leave it alone. */
export function evaluate(message, cfg = config.automod ?? {}, memory = recent) {
  if (!cfg.enabled) return null;
  if ((cfg.ignoredChannelIds ?? []).includes(message.channelId)) return null;
  if (exempt(message, cfg)) return null;

  for (const rule of RULES) {
    const reason = rule.test(message, cfg, memory);
    if (reason) return { rule: rule.id, reason };
  }
  return null;
}

/** Warnings past the threshold escalate to a timeout, then to a kick. */
export function escalationFor(count, cfg = config.automod ?? {}) {
  const ladder = cfg.escalation ?? { timeoutAt: 3, timeoutMinutes: 60, kickAt: 6 };
  if (ladder.kickAt && count >= ladder.kickAt) return { action: 'kick' };
  if (ladder.timeoutAt && count >= ladder.timeoutAt) {
    return { action: 'timeout', minutes: ladder.timeoutMinutes ?? 60 };
  }
  return { action: 'none' };
}

export async function handleMessage(message) {
  if (message.author?.bot || !message.guild) return;

  const cfg = config.automod ?? {};
  const hit = evaluate(message, cfg);
  if (!hit) return;

  await message.delete().catch(() => {});

  const entry = await logAction(message.client, {
    action: 'automod',
    userId: message.author.id,
    userTag: message.author.tag ?? message.author.username,
    reason: `${hit.reason} (rule: ${hit.rule})`,
  });

  if (cfg.notifyMember !== false) {
    await message.author
      .send(`Your message in **${message.guild.name}** was removed — you ${hit.reason}. (case #${entry.id})`)
      .catch(() => {});
  }

  const { action, minutes } = escalationFor(warningCount(message.author.id), cfg);
  if (action === 'none') return;

  try {
    if (action === 'timeout') {
      await message.member?.timeout(minutes * 60_000, `automod escalation (case #${entry.id})`);
      await logAction(message.client, {
        action: 'timeout', userId: message.author.id,
        userTag: message.author.tag ?? message.author.username,
        reason: `Automatic — repeated automod hits`, duration: `${minutes} min`,
      });
    } else if (action === 'kick') {
      await message.member?.kick(`automod escalation (case #${entry.id})`);
      await logAction(message.client, {
        action: 'kick', userId: message.author.id,
        userTag: message.author.tag ?? message.author.username,
        reason: 'Automatic — repeated automod hits',
      });
    }
  } catch (err) {
    log.warn(`escalation (${action}) failed for ${message.author.tag}:`, err.message);
  }
}

/** New-account gate: quarantine or bounce accounts younger than N days. */
export async function handleJoin(member) {
  const cfg = config.automod ?? {};
  const days = cfg.minAccountAgeDays ?? 0;
  if (!days) return false;

  const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  if (ageDays >= days) return false;

  const rounded = Math.floor(ageDays);
  if (cfg.quarantineRoleId && /^\d{17,20}$/.test(cfg.quarantineRoleId)) {
    await member.roles.add(cfg.quarantineRoleId, `account only ${rounded}d old`).catch(() => {});
    await logAction(member.client, {
      action: 'automod', userId: member.id, userTag: member.user.tag ?? member.user.username,
      reason: `Quarantined — account is ${rounded} day(s) old, minimum is ${days}`,
    });
    return true;
  }

  await member.kick(`account younger than ${days} days`).catch(() => {});
  await logAction(member.client, {
    action: 'kick', userId: member.id, userTag: member.user.tag ?? member.user.username,
    reason: `Account is ${rounded} day(s) old, minimum is ${days}`,
  });
  return true;
}

/**
 * Three small things that all watch message text: catchphrase replies, keyword
 * alerts sent to the creator, and nickname hygiene.
 *
 * All of them need the Message Content intent, except the dehoist.
 */
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('triggers');
const cooldowns = new Map();

/** First matching trigger wins, so put the specific ones first in config. */
export function matchTrigger(content, triggers = config.triggers?.list ?? []) {
  const text = String(content ?? '').toLowerCase();
  if (!text) return null;
  return (
    triggers.find((trigger) => {
      const phrase = String(trigger.match ?? '').toLowerCase().trim();
      if (!phrase) return false;
      return trigger.exact ? text === phrase : text.includes(phrase);
    }) ?? null
  );
}

/** Which watched keywords appear in this message. */
export function matchKeywords(content, keywords = config.keywordAlerts?.words ?? []) {
  const text = String(content ?? '').toLowerCase();
  if (!text) return [];
  return keywords.map((w) => String(w).toLowerCase().trim()).filter((w) => w && text.includes(w));
}

export async function handleMessage(message) {
  const triggerCfg = config.triggers ?? {};
  const alertCfg = config.keywordAlerts ?? {};

  if (triggerCfg.enabled) {
    const trigger = matchTrigger(message.content);
    if (trigger) {
      // One reply per trigger per window, so a catchphrase can't be spammed.
      const key = `${trigger.match}:${message.channelId}`;
      const cooldownMs = (triggerCfg.cooldownSeconds ?? 30) * 1000;
      if (Date.now() - (cooldowns.get(key) ?? 0) > cooldownMs) {
        cooldowns.set(key, Date.now());
        await message.reply({ content: trigger.reply, allowedMentions: { parse: [] } }).catch(() => {});
      }
    }
  }

  if (alertCfg.enabled && /^\d{17,20}$/.test(alertCfg.notifyUserId ?? '')) {
    const hits = matchKeywords(message.content);
    if (hits.length && message.author.id !== alertCfg.notifyUserId) {
      const user = await message.client.users.fetch(alertCfg.notifyUserId).catch(() => null);
      await user?.send({
        embeds: [
          embed({ variant: 'soft' })
            .setTitle(`🔔 "${hits[0]}" mentioned`)
            .setDescription(message.content.slice(0, 900))
            .addFields({ name: 'Where', value: `<#${message.channelId}> · [jump](${message.url})` })
            .setFooter({ text: `by ${message.author.username}` }),
        ],
      }).catch(() => log.debug('keyword alert DM blocked'));
    }
  }
}

/* ── nickname hygiene ──────────────────────────────────────────────────── */

const HOIST = /^[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]+/;

/** Strip leading punctuation used to sit at the top of the member list. */
export function dehoisted(name, replacement = 'member') {
  const stripped = String(name ?? '').replace(HOIST, '').trim();
  return stripped.length >= 2 ? stripped : replacement;
}

export async function handleMemberName(member) {
  const cfg = config.nicknames ?? {};
  if (!cfg.dehoist) return false;

  const current = member.displayName ?? '';
  if (!HOIST.test(current)) return false;

  const next = dehoisted(current, cfg.fallback ?? 'member');
  if (next === current) return false;

  const me = await member.guild.members.fetchMe();
  if (member.roles.highest.position >= me.roles.highest.position) return false;

  await member.setNickname(next, 'dehoist').catch(() => {});
  return true;
}

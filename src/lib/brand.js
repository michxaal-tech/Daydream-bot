/**
 * Every embed the bot sends goes through here, so the lavender accent bar on
 * the left edge is consistent across replies, welcomes and upload webhooks.
 */
import { ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { config } from './config.js';

const hex = (value, fallback) => {
  const raw = String(value ?? fallback).replace('#', '');
  const n = Number.parseInt(raw, 16);
  return Number.isNaN(n) ? Number.parseInt(fallback.replace('#', ''), 16) : n;
};

export const COLORS = {
  /** Lavender — the default left-hand bar on every embed. */
  accent: hex(config.brand?.accent, '#A78BFA'),
  /** Softer lilac, used for low-key / passive notices. */
  soft: hex(config.brand?.accentSoft, '#C4B5FD'),
  /** Deeper violet, used for live / urgent notices. */
  deep: hex(config.brand?.accentDeep, '#7C5CFF'),
};

/**
 * Platform brand colors. Off by default (brand.usePlatformColors) so the whole
 * server reads as one lavender look instead of a rainbow of vendor reds.
 */
export const PLATFORM_COLORS = {
  youtube: 0xff0000,
  tiktok: 0x00f2ea,
  x: 0x1d1d1f,
  instagram: 0xe1306c,
  twitch: 0x9146ff,
  kick: 0x53fc18,
};

export function colorFor(platform, variant = 'accent') {
  if (config.brand?.usePlatformColors && platform && PLATFORM_COLORS[platform]) {
    return PLATFORM_COLORS[platform];
  }
  return COLORS[variant] ?? COLORS.accent;
}

/** Base embed: lavender bar + brand footer already applied. */
export function embed({ platform, variant = 'accent' } = {}) {
  const e = new EmbedBuilder().setColor(colorFor(platform, variant));
  const footerText = config.brand?.footerText;
  if (footerText) {
    e.setFooter({ text: footerText, iconURL: config.brand?.footerIcon || undefined });
  }
  return e;
}

/** `<:name:id>` / `a:name:id` — a custom server emoji Discord will accept. */
const CUSTOM_EMOJI = /^<?a?:\w{2,32}:\d{17,20}>?$/;

/**
 * Discord rejects a button whose emoji isn't a real one, and rejects the whole
 * message with it. `𝕏` (U+1D54F) is the usual culprit — it's a maths symbol
 * that merely looks like the X logo. Anything unrecognised is dropped so the
 * button still renders, minus its icon.
 */
export function safeEmoji(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (CUSTOM_EMOJI.test(raw)) return raw;
  return /\p{Extended_Pictographic}/u.test(raw) ? raw : null;
}

/** A link button, with the emoji applied only when Discord will accept it. */
export function linkButton({ label, url, emoji }) {
  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(String(label ?? 'Open').slice(0, 80))
    .setURL(url);
  const safe = safeEmoji(emoji);
  if (safe) button.setEmoji(safe);
  return button;
}

/**
 * "I can't post there" is useless on its own — Discord has three separate
 * permissions that each break a rich message in a different way, and channel
 * overrides mean a bot can hold one and not the others. Name the missing ones.
 */
const NEEDED = [
  ['ViewChannel', PermissionFlagsBits.ViewChannel, 'View Channel'],
  ['SendMessages', PermissionFlagsBits.SendMessages, 'Send Messages'],
  ['EmbedLinks', PermissionFlagsBits.EmbedLinks, 'Embed Links'],
];

export function missingPermissions(channel, me) {
  const held = channel.permissionsFor(me);
  if (!held) return NEEDED.map(([, , label]) => label);
  return NEEDED.filter(([, flag]) => !held.has(flag)).map(([, , label]) => label);
}

/** Throws with the fix spelled out, or returns quietly. */
export function assertCanPost(channel, me) {
  const missing = missingPermissions(channel, me);
  if (!missing.length) return;
  throw new Error(
    `I'm missing **${missing.join('**, **')}** in ${channel}.\n` +
      `Fix it in Discord: **Edit Channel → Permissions → Add my role** (or me), and allow ${missing.join(', ')}.`
  );
}

export const PLATFORM_META = {
  youtube: { label: 'YouTube', emoji: '📺', verb: 'uploaded' },
  tiktok: { label: 'TikTok', emoji: '🎵', verb: 'posted' },
  x: { label: 'X', emoji: '𝕏', verb: 'posted' },
  instagram: { label: 'Instagram', emoji: '📸', verb: 'posted' },
  twitch: { label: 'Twitch', emoji: '🔴', verb: 'went live' },
  kick: { label: 'Kick', emoji: '🟢', verb: 'went live' },
};

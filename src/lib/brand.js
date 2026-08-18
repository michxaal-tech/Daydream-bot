/**
 * Every embed the bot sends goes through here, so the lavender accent bar on
 * the left edge is consistent across replies, welcomes and upload webhooks.
 */
import { EmbedBuilder } from 'discord.js';
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

export const PLATFORM_META = {
  youtube: { label: 'YouTube', emoji: '📺', verb: 'uploaded' },
  tiktok: { label: 'TikTok', emoji: '🎵', verb: 'posted' },
  x: { label: 'X', emoji: '𝕏', verb: 'posted' },
  instagram: { label: 'Instagram', emoji: '📸', verb: 'posted' },
  twitch: { label: 'Twitch', emoji: '🔴', verb: 'went live' },
  kick: { label: 'Kick', emoji: '🟢', verb: 'went live' },
};

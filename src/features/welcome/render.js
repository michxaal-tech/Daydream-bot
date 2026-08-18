import { ActionRowBuilder, ButtonBuilder, ButtonStyle, time, TimestampStyles } from 'discord.js';
import { embed } from '../../lib/brand.js';
import { config } from '../../lib/config.js';

const ORDINAL = new Intl.PluralRules('en-US', { type: 'ordinal' });
const SUFFIX = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
const ordinal = (n) => `${n.toLocaleString('en-US')}${SUFFIX[ORDINAL.select(n)]}`;

function pick(list, seed) {
  if (!list?.length) return '';
  return list[Number(BigInt(seed) % BigInt(list.length))];
}

/**
 * Fill the placeholders every welcome string supports:
 *   {user} {tag} {name} {server} {count} {ordinal} {rules} {intros} {roles}
 */
export function fillTokens(text, member, cfg = config.welcome) {
  const count = member.guild.memberCount;
  const channelRef = (id) => (id && !id.startsWith('RULES') && !id.startsWith('INTROS') && !id.startsWith('ROLES') ? `<#${id}>` : '');
  return String(text)
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{tag}', member.user.tag ?? member.user.username)
    .replaceAll('{name}', member.displayName ?? member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(count))
    .replaceAll('{ordinal}', ordinal(count))
    .replaceAll('{rules}', channelRef(cfg?.rulesChannelId))
    .replaceAll('{intros}', channelRef(cfg?.introsChannelId))
    .replaceAll('{roles}', channelRef(cfg?.rolesChannelId));
}

/**
 * The whole welcome payload. The @-mention lives in `content` (not just the
 * embed) because that is the only part Discord turns into a real ping.
 */
export function buildWelcome(member, { cfg = config.welcome } = {}) {
  const greeting = fillTokens(pick(cfg.greetings, member.id) || 'welcome {user}!', member, cfg);
  const pingInline = cfg.pingUser !== false && cfg.pingStyle !== 'embed';

  const payload = {
    content: pingInline ? greeting : undefined,
    allowedMentions: { users: cfg.pingUser === false ? [] : [member.id] },
  };

  if (cfg.useEmbed === false) {
    if (!payload.content) payload.content = greeting;
    return payload;
  }

  const e = embed()
    .setAuthor({ name: `${member.user.username} joined`, iconURL: member.user.displayAvatarURL() })
    .setTitle(`Welcome to ${member.guild.name} 💜`)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp(new Date());

  const lines = [];
  if (cfg.pingUser !== false && (cfg.pingStyle === 'both' || cfg.pingStyle === 'embed')) {
    lines.push(`Hey <@${member.id}> — glad you made it.`);
  }
  const pointers = [
    cfg.rulesChannelId && !cfg.rulesChannelId.startsWith('RULES') ? `📜 Read <#${cfg.rulesChannelId}>` : null,
    cfg.rolesChannelId && !cfg.rolesChannelId.startsWith('ROLES') ? `🎨 Grab your roles in <#${cfg.rolesChannelId}>` : null,
    cfg.introsChannelId && !cfg.introsChannelId.startsWith('INTROS') ? `👋 Say hi in <#${cfg.introsChannelId}>` : null,
  ].filter(Boolean);
  if (pointers.length) lines.push('', ...pointers);
  if (lines.length) e.setDescription(lines.join('\n'));

  const fields = [];
  if (cfg.showMemberCount !== false) {
    fields.push({
      name: 'Member',
      value: `You're the **${ordinal(member.guild.memberCount)}** member`,
      inline: true,
    });
  }
  if (cfg.showAccountAge !== false) {
    fields.push({
      name: 'Account created',
      value: time(member.user.createdAt, TimestampStyles.RelativeTime),
      inline: true,
    });
  }
  if (fields.length) e.addFields(fields);

  payload.embeds = [e];

  const links = cfg.buttons?.enabled === false ? [] : (cfg.buttons?.links ?? []);
  if (links.length) {
    const row = new ActionRowBuilder().addComponents(
      links.slice(0, 5).map((l) =>
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(l.label)
          .setURL(l.url)
          .setEmoji(l.emoji || undefined)
      )
    );
    payload.components = [row];
  }

  return payload;
}

/** DM copy — no ping (you can't ping someone in their own DMs) and no buttons row limit fuss. */
export function buildWelcomeDm(member, { cfg = config.welcome } = {}) {
  const e = embed()
    .setTitle(`Welcome to ${member.guild.name} 💜`)
    .setDescription(
      [
        `Hey **${member.displayName ?? member.user.username}** — thanks for joining.`,
        '',
        'A few things worth doing first:',
        cfg.rulesChannelId && !cfg.rulesChannelId.startsWith('RULES') ? '• Skim the rules so nothing catches you out' : null,
        '• Pick up notification roles so you hear about uploads and streams',
        '• Drop an intro — the server is a lot more fun once people know you',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .setThumbnail(member.guild.iconURL({ size: 256 }) ?? null);

  const payload = { embeds: [e] };
  const links = cfg.buttons?.links ?? [];
  if (links.length) {
    payload.components = [
      new ActionRowBuilder().addComponents(
        links.slice(0, 5).map((l) =>
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(l.label)
            .setURL(l.url)
            .setEmoji(l.emoji || undefined)
        )
      ),
    ];
  }
  return payload;
}

export function buildGoodbye(member, { cfg = config.welcome } = {}) {
  const messages = cfg.goodbye?.messages ?? ['**{tag}** left.'];
  return {
    content: fillTokens(pick(messages, member.id), member, cfg),
    allowedMentions: { parse: [] },
  };
}

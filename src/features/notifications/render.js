import { ActionRowBuilder } from 'discord.js';
import { embed, linkButton, PLATFORM_META } from '../../lib/brand.js';
import { config } from '../../lib/config.js';

const nf = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** Fill {placeholders} in an account's message template. */
export function renderContent(account, post) {
  const meta = PLATFORM_META[account.platform] ?? { label: account.platform, verb: 'posted' };
  const roleMention = account.mentionEveryone
    ? '@everyone'
    : account.mentionRoleId
      ? `<@&${account.mentionRoleId}>`
      : '';

  const template =
    account.template ?? `{roleMention} **{author}** ${meta.verb} on ${meta.label}`;

  return template
    .replaceAll('{roleMention}', roleMention)
    .replaceAll('{author}', post.author ?? account.handle ?? '')
    .replaceAll('{title}', post.title ?? '')
    .replaceAll('{url}', post.url ?? '')
    .replaceAll('{platform}', meta.label)
    .replace(/\s+/g, ' ')
    .trim();
}

/** The embed — lavender bar, thumbnail, and whatever stats the platform gave us. */
export function renderEmbed(account, post) {
  const meta = PLATFORM_META[account.platform] ?? { label: account.platform, emoji: '🔔' };
  const variant = post.kind === 'live' ? 'deep' : 'accent';

  const e = embed({ platform: account.platform, variant })
    .setAuthor({
      name: `${meta.emoji} ${post.author ?? account.handle} · ${meta.label}`,
      url: post.authorUrl ?? undefined,
      iconURL: post.avatar ?? undefined,
    })
    .setTitle(post.title?.slice(0, 250) || `New ${meta.label} post`)
    .setURL(post.url)
    .setTimestamp(post.publishedAt ?? new Date());

  if (post.description) e.setDescription(post.description);
  if (post.thumbnail) e.setImage(post.thumbnail);
  if (config.brand?.thumbnail) e.setThumbnail(config.brand.thumbnail);

  const fields = [];
  if (post.stats?.duration) fields.push({ name: 'Length', value: post.stats.duration, inline: true });
  if (post.stats?.views != null) fields.push({ name: 'Views', value: nf.format(post.stats.views), inline: true });
  if (post.stats?.viewers != null) fields.push({ name: 'Watching', value: nf.format(post.stats.viewers), inline: true });
  if (post.stats?.game) fields.push({ name: 'Category', value: post.stats.game, inline: true });
  if (post.stats?.likes != null) fields.push({ name: 'Likes', value: nf.format(post.stats.likes), inline: true });
  if (fields.length) e.addFields(fields.slice(0, 4));

  return e;
}

/** One link button straight to the post, plus the creator's profile. */
export function renderButtons(account, post) {
  const meta = PLATFORM_META[account.platform] ?? { label: account.platform, emoji: '🔗' };
  const row = new ActionRowBuilder().addComponents(
    linkButton({
      label: post.kind === 'live' ? 'Watch the stream' : `Watch on ${meta.label}`,
      url: post.url,
    })
  );
  if (post.authorUrl && post.authorUrl !== post.url) {
    row.addComponents(linkButton({ label: 'Profile', url: post.authorUrl }));
  }
  return [row];
}

export function renderAll(account, post) {
  return {
    content: renderContent(account, post) || undefined,
    embeds: [renderEmbed(account, post)],
    components: renderButtons(account, post),
  };
}

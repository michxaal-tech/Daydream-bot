/**
 * Starboard: react ⭐ enough times and the message gets immortalised.
 *
 * The link between the original and its starboard post is stored, so later
 * reactions edit the existing post instead of creating a second one.
 */
import { getIn, setIn, deleteIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';
import { embed } from '../../lib/brand.js';
import { logger } from '../../lib/logger.js';

const log = logger('starboard');
const COLLECTION = 'starboard';

const cfgOf = () => config.starboard ?? {};

export function starboardEmbed(message, count) {
  const e = embed()
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content?.slice(0, 3000) || '_no text_')
    .addFields({ name: 'Jump', value: `[go to message](${message.url})` })
    .setTimestamp(message.createdAt);

  const image = message.attachments?.find?.((a) => a.contentType?.startsWith('image/'));
  if (image) e.setImage(image.url);
  e.setFooter({ text: `${cfgOf().emoji ?? '⭐'} ${count} · #${message.channel.name}` });
  return e;
}

/** Called on every add/remove of the starboard emoji. */
export async function sync(reaction, client) {
  const cfg = cfgOf();
  if (!cfg.enabled) return;

  const emoji = cfg.emoji ?? '⭐';
  if ((reaction.emoji.name ?? '') !== emoji) return;
  if (!/^\d{17,20}$/.test(cfg.channelId ?? '')) return;
  if (reaction.message.channelId === cfg.channelId) return; // don't star the starboard

  const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
  if (!message || message.author?.bot) return;

  const count = reaction.count ?? 0;
  const threshold = cfg.threshold ?? 3;
  const existingId = getIn(COLLECTION, message.id);

  const board = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!board?.isTextBased()) return;

  if (count < threshold) {
    // dropped back below the bar — take it down again
    if (existingId) {
      await board.messages.fetch(existingId).then((m) => m.delete()).catch(() => {});
      deleteIn(COLLECTION, message.id);
    }
    return;
  }

  const payload = { embeds: [starboardEmbed(message, count)], allowedMentions: { parse: [] } };
  if (existingId) {
    const posted = await board.messages.fetch(existingId).catch(() => null);
    if (posted) return posted.edit(payload).catch((e) => log.warn('starboard edit failed:', e.message));
  }
  const posted = await board.send(payload).catch((e) => {
    log.warn('starboard post failed:', e.message);
    return null;
  });
  if (posted) setIn(COLLECTION, message.id, posted.id);
}

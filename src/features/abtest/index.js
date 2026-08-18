/**
 * Thumbnail A/B: post two images side by side, let people vote with buttons,
 * read the split before you commit to one. Deliberately simple — two options,
 * one vote each, no partial credit.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { collection, getIn, setIn, nextId } from '../../lib/store.js';
import { embed } from '../../lib/brand.js';

const COLLECTION = 'abtests';
export const CUSTOM_ID = 'abtest';

export const activeTests = () =>
  Object.values(collection(COLLECTION)).filter((t) => !t.closed).sort((a, b) => b.at - a.at);
export const getTest = (id) => getIn(COLLECTION, String(id));

export function testEmbed(test) {
  const a = test.votes.a.length;
  const b = test.votes.b.length;
  const total = a + b;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const bar = (n) => `${'▰'.repeat(Math.round((total ? n / total : 0) * 12))}${'▱'.repeat(12 - Math.round((total ? n / total : 0) * 12))}`;

  return embed({ variant: test.closed ? 'soft' : 'accent' })
    .setTitle(`🅰️🅱️ ${test.question}`)
    .setDescription(
      test.closed || test.showLive
        ? [`**A · ${test.labelA}**`, `\`${bar(a)}\` ${a} · ${pct(a)}%`, '', `**B · ${test.labelB}**`, `\`${bar(b)}\` ${b} · ${pct(b)}%`].join('\n')
        : `**A · ${test.labelA}** vs **B · ${test.labelB}**\n\n${total} vote${total === 1 ? '' : 's'} so far — results are hidden until it closes.`
    )
    .setImage(test.imageA || null)
    .setFooter({ text: test.closed ? `Winner: ${a === b ? 'tie' : a > b ? test.labelA : test.labelB}` : 'One vote each — press again to change it' });
}

export const testButtons = (test) =>
  test.closed
    ? []
    : [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`${CUSTOM_ID}:${test.id}:a`).setStyle(ButtonStyle.Secondary).setLabel(`A · ${test.labelA}`.slice(0, 40)).setEmoji('🅰️'),
          new ButtonBuilder().setCustomId(`${CUSTOM_ID}:${test.id}:b`).setStyle(ButtonStyle.Secondary).setLabel(`B · ${test.labelB}`.slice(0, 40)).setEmoji('🅱️')
        ),
      ];

export async function createTest(channel, { question, labelA, labelB, imageA, imageB, showLive, author }) {
  const id = nextId('abtest');
  const test = {
    id, question, labelA: labelA || 'A', labelB: labelB || 'B',
    imageA: imageA ?? null, imageB: imageB ?? null,
    votes: { a: [], b: [] }, showLive: Boolean(showLive), closed: false,
    authorId: author?.id ?? null, at: Date.now(), channelId: channel.id, messageId: null,
  };

  const message = await channel.send({ embeds: [testEmbed(test)], components: testButtons(test) });
  // Discord shows one image per embed, so B rides along in a second message.
  if (test.imageB) {
    await channel.send({ embeds: [embed({ variant: 'soft' }).setTitle(`B · ${test.labelB}`).setImage(test.imageB)] }).catch(() => {});
  }
  test.messageId = message.id;
  setIn(COLLECTION, String(id), test);
  return { test, message };
}

export async function handleButton(interaction) {
  const [, rawId, side] = interaction.customId.split(':');
  const test = getTest(rawId);
  if (!test) return 'That test is no longer tracked.';
  if (test.closed) return 'Voting has closed on that one.';

  const mine = side === 'a' ? 'a' : 'b';
  const other = mine === 'a' ? 'b' : 'a';
  const userId = interaction.user.id;

  test.votes[other] = test.votes[other].filter((id) => id !== userId);
  const had = test.votes[mine].includes(userId);
  test.votes[mine] = had ? test.votes[mine].filter((id) => id !== userId) : [...test.votes[mine], userId];
  setIn(COLLECTION, String(test.id), test);

  await interaction.message.edit({ embeds: [testEmbed(test)], components: testButtons(test) });
  return had ? 'Vote withdrawn.' : `Voted **${mine === 'a' ? test.labelA : test.labelB}**.`;
}

export async function closeTest(client, id) {
  const test = getTest(id);
  if (!test) throw new Error('No test with that id.');
  if (test.closed) throw new Error('That test is already closed.');
  test.closed = true;
  setIn(COLLECTION, String(id), test);

  const channel = await client.channels.fetch(test.channelId).catch(() => null);
  const message = await channel?.messages.fetch(test.messageId).catch(() => null);
  await message?.edit({ embeds: [testEmbed(test)], components: [] }).catch(() => {});
  return test;
}

/**
 * Smoke test — imports every module and asserts the payloads the bot builds are
 * shaped the way Discord expects. No network, no token needed.
 *
 *   node scripts/syntax-check.js
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { COLORS } from '../src/lib/brand.js';
import { buildWelcome } from '../src/features/welcome/render.js';
import { renderAll } from '../src/features/notifications/render.js';
import { platformIds, getPlatform } from '../src/features/notifications/platforms/index.js';
import { parseOptions, buildPoll, LIMITS } from '../src/features/polls/index.js';
import { missingPermissions, assertCanPost } from '../src/lib/brand.js';

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('every command module exposes data + execute', async () => {
  const dir = resolve('src/commands');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const mod = (await import(pathToFileURL(resolve(dir, file)).href)).default;
    assert.ok(mod?.data?.name, `${file} has no command data`);
    assert.equal(typeof mod.execute, 'function', `${file} has no execute()`);
    mod.data.toJSON(); // throws if the builder is invalid
  }
});

check('every event module exposes name + execute', async () => {
  const dir = resolve('src/events');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const mod = (await import(pathToFileURL(resolve(dir, file)).href)).default;
    assert.ok(mod?.name, `${file} has no event name`);
    assert.equal(typeof mod.execute, 'function', `${file} has no execute()`);
  }
});

check('every platform adapter is registered and callable', () => {
  for (const id of platformIds) {
    const p = getPlatform(id);
    assert.equal(p.id, id);
    assert.equal(typeof p.fetchLatest, 'function');
  }
});

check('accent bar is lavender', () => {
  assert.equal(COLORS.accent, 0xa78bfa);
  assert.equal(COLORS.deep, 0x7c5cff);
});

check('an unacceptable button emoji is dropped, not sent to Discord', () => {
  // 𝕏 (U+1D54F) is a maths symbol. Sent as a button emoji it fails the whole
  // message with COMPONENT_INVALID_EMOJI, so it must never reach the payload.
  const cfg = {
    greetings: ['welcome {user}'],
    buttons: {
      links: [
        { label: 'X', emoji: '𝕏', url: 'https://x.com/daydream' },
        { label: 'YouTube', emoji: '📺', url: 'https://youtube.com/@daydream' },
        { label: 'Custom', emoji: '<:xlogo:123456789012345678>', url: 'https://x.com/d' },
      ],
    },
  };
  const [row] = buildWelcome(fakeMember(), { cfg }).components;
  const [x, yt, custom] = row.toJSON().components;
  assert.equal(x.emoji, undefined, '𝕏 should have been dropped');
  assert.equal(x.label, 'X', 'the button itself must survive');
  assert.equal(yt.emoji.name, '📺');
  assert.equal(custom.emoji.id, '123456789012345678', 'custom server emoji must pass through');
});

check('welcome payload puts the ping in content (the only place it pings)', () => {
  const member = fakeMember();
  const payload = buildWelcome(member);
  assert.ok(payload.content?.includes(`<@${member.id}>`), 'no mention in content');
  assert.deepEqual(payload.allowedMentions.users, [member.id]);
  assert.equal(payload.embeds[0].toJSON().color, 0xa78bfa);
});

check('upload payload has content, one embed and a link button', () => {
  const account = { id: 't', platform: 'youtube', handle: '@x', mentionRoleId: '1140000000000000001' };
  const post = {
    id: 'yt:1', url: 'https://www.youtube.com/watch?v=1', title: 'hello',
    description: 'world', thumbnail: 'https://i.ytimg.com/vi/1/hq.jpg',
    author: 'Daydream', authorUrl: 'https://www.youtube.com/@daydream',
    publishedAt: new Date(), kind: 'video', stats: { duration: '1:00', views: 10 },
  };
  const payload = renderAll(account, post);
  assert.ok(payload.content.includes('<@&1140000000000000001>'));
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].toJSON().url, post.url);
  assert.equal(payload.components[0].toJSON().components[0].style, 5); // Link
});

check('live posts use the deeper violet, not the default lavender', () => {
  const account = { id: 't', platform: 'twitch', handle: 'x' };
  const post = {
    id: 'tw:1', url: 'https://twitch.tv/x', title: 'live', description: '',
    author: 'x', authorUrl: 'https://twitch.tv/x', publishedAt: new Date(),
    kind: 'live', stats: { viewers: 5 },
  };
  assert.equal(renderAll(account, post).embeds[0].toJSON().color, 0x7c5cff);
});

check('a blocked channel names the exact permissions it is missing', () => {
  const channel = { toString: () => '#polls', permissionsFor: () => ({ has: (flag) => flag === 2048n /* SendMessages only */ }) };
  assert.deepEqual(missingPermissions(channel, {}), ['View Channel', 'Embed Links']);
  assert.throws(() => assertCanPost(channel, {}), /View Channel.+Embed Links/s);

  const open = { toString: () => '#general', permissionsFor: () => ({ has: () => true }) };
  assert.deepEqual(missingPermissions(open, {}), []);
  assert.doesNotThrow(() => assertCanPost(open, {}));

  // No overwrite resolvable at all — treat as fully blocked, not as allowed.
  const invisible = { toString: () => '#secret', permissionsFor: () => null };
  assert.equal(missingPermissions(invisible, {}).length, 3);
});

check('poll options parse, surviving the quotes people paste in', () => {
  // The exact input that broke in production: the whole list wrapped in quotes,
  // fusing a `"` onto the first emoji. Discord rejects `"🎮` as an emoji.
  assert.deepEqual(parseOptions('"🎮 gaming | 🍜 food | 🎤 q&a"'), [
    { emoji: '🎮', text: 'gaming' },
    { emoji: '🍜', text: 'food' },
    { emoji: '🎤', text: 'q&a' },
  ]);
  assert.deepEqual(parseOptions('gaming | food'), [
    { emoji: null, text: 'gaming' },
    { emoji: null, text: 'food' },
  ]);
  assert.equal(parseOptions('a|b|c|d|e|f|g|h|i|j|k|l').length, LIMITS.answers);
  assert.equal(parseOptions('  one  ||  two  ').length, 2);
});

check('poll payload matches what Discord accepts', () => {
  const poll = buildPoll({
    question: 'what should I film next?',
    options: parseOptions('🎮 gaming | food'),
    hours: 24,
    multi: false,
  });
  assert.equal(poll.question.text, 'what should I film next?');
  assert.deepEqual(poll.answers, [{ text: 'gaming', emoji: '🎮' }, { text: 'food' }]);
  assert.equal(poll.allowMultiselect, false);
  assert.equal(poll.duration, 24);
});

check('poll duration is clamped to the range Discord allows', () => {
  const of = (hours) => buildPoll({ question: 'q', options: parseOptions('a|b'), hours }).duration;
  assert.equal(of(0), LIMITS.minHours, 'zero would be rejected');
  assert.equal(of(0.2), LIMITS.minHours);
  assert.equal(of(99_999), LIMITS.maxHours);
  assert.equal(of(72), 72);
});

check('over-long question and answers are truncated, not rejected', () => {
  const poll = buildPoll({
    question: 'q'.repeat(500),
    options: parseOptions(`${'a'.repeat(200)}|b`),
    hours: 1,
  });
  assert.equal(poll.question.text.length, LIMITS.question);
  assert.equal(poll.answers[0].text.length, LIMITS.answer);
});

function fakeMember() {
  return {
    id: '284620194716532736',
    displayName: 'lunaaa',
    user: {
      tag: 'lunaaa', username: 'lunaaa', createdAt: new Date('2021-03-14'),
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/4.png',
    },
    guild: { name: 'Daydream HQ', memberCount: 12483, iconURL: () => null },
  };
}

let failed = 0;
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}\n  ${err.message}`);
  }
}
console.log(failed ? `\n${failed} check(s) failed` : `\nall ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);

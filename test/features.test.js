/**
 * Behaviour tests for the community features. No network, no Discord — every
 * rule here is pure enough to call directly.
 *
 *   node test/features.test.js
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'daydream-features-'));
process.env.DATA_DIR = dir;

const { config } = await import('../src/lib/config.js');
const levels = await import('../src/features/levels/index.js');
const { evaluate, escalationFor, RULES } = await import('../src/features/moderation/automod.js');
const { draw } = await import('../src/features/giveaways/index.js');
const { parseDuration } = await import('../src/features/reminders/index.js');
const { panelButtons, panelEmbed } = await import('../src/features/roles/index.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ── levels ────────────────────────────────────────────────────────────────
test('the level curve is monotonic and matches the published one', () => {
  assert.equal(levels.xpToClear(0), 100);
  assert.equal(levels.xpToClear(1), 155);
  assert.equal(levels.xpToClear(5), 475);
  for (let i = 1; i < 40; i++) {
    assert.ok(levels.xpToClear(i) > levels.xpToClear(i - 1), `level ${i} got cheaper`);
  }
});

test('xp converts back to the level it came from', () => {
  for (const level of [0, 1, 5, 12, 30]) {
    const at = levels.totalXpFor(level);
    assert.equal(levels.levelFromXp(at).level, level, `${at} xp should be level ${level}`);
    assert.equal(levels.levelFromXp(at).into, 0, 'should sit exactly on the boundary');
    if (level > 0) assert.equal(levels.levelFromXp(at - 1).level, level - 1, 'one xp short is the level below');
  }
});

test('xp is awarded once per cooldown, not once per message', () => {
  config.levels = { enabled: true, cooldownSeconds: 60, minPerMessage: 20, maxPerMessage: 20 };
  const user = 'cooldown-tester';
  const t0 = 1_000_000;

  levels.awardForMessage(user, { now: t0 });
  assert.equal(levels.getMember(user).xp, 20);

  levels.awardForMessage(user, { now: t0 + 5_000 });
  assert.equal(levels.getMember(user).xp, 20, 'inside the window, no xp');
  assert.equal(levels.getMember(user).messages, 2, 'but the message still counts');

  levels.awardForMessage(user, { now: t0 + 61_000 });
  assert.equal(levels.getMember(user).xp, 40, 'past the window, xp again');
});

test('levelling up is reported exactly once', () => {
  config.levels = { enabled: true, cooldownSeconds: 0, minPerMessage: 100, maxPerMessage: 100 };
  const user = 'levelling-tester';
  let now = 0;
  const results = [];
  for (let i = 0; i < 4; i++) results.push(levels.awardForMessage(user, { now: (now += 1000) }));
  // 100 xp clears level 0 exactly, so message 1 levels up. Level 1 then needs
  // 155 more, which message 3 delivers. Nothing fires in between.
  assert.deepEqual(results, [1, null, 2, null]);
  assert.equal(levels.levelFromXp(levels.getMember(user).xp).level, 2);
});

test('level rewards only fire at their own level', () => {
  config.levels = { enabled: true, rewards: { 5: '111111111111111111', 10: '222222222222222222' } };
  assert.deepEqual(levels.rewardsFor(5), ['111111111111111111']);
  assert.deepEqual(levels.rewardsFor(6), []);
  assert.deepEqual(levels.allRewardsUpTo(10), ['111111111111111111', '222222222222222222']);
});

// ── automod ───────────────────────────────────────────────────────────────
const message = (content, extra = {}) => ({
  content,
  channelId: 'c1',
  author: { id: 'u1', bot: false },
  mentions: { users: { size: extra.users ?? 0 }, roles: { size: extra.roles ?? 0 } },
  member: { permissions: { has: () => false }, roles: { cache: { has: () => false } } },
  ...extra,
});

test('automod catches invites, shouting and mass mentions', () => {
  const cfg = { enabled: true, blockInvites: true, maxMentions: 5, maxCapsPercent: 70 };
  assert.equal(evaluate(message('join discord.gg/abc123'), cfg)?.rule, 'invites');
  assert.equal(evaluate(message('WHY IS NOBODY ANSWERING ME'), cfg)?.rule, 'caps');
  assert.equal(evaluate(message('hey', { users: 6 }), cfg)?.rule, 'mentions');
  assert.equal(evaluate(message('a perfectly normal sentence'), cfg), null);
});

test('automod leaves staff and exempt roles alone', () => {
  const cfg = { enabled: true, blockInvites: true, exemptRoleIds: ['999'] };
  const staff = message('discord.gg/abc', { member: { permissions: { has: () => true }, roles: { cache: { has: () => false } } } });
  const vip = message('discord.gg/abc', { member: { permissions: { has: () => false }, roles: { cache: { has: (id) => id === '999' } } } });
  assert.equal(evaluate(staff, cfg), null, 'a mod posting a link is not automod business');
  assert.equal(evaluate(vip, cfg), null);
});

test('automod is inert when disabled or in an ignored channel', () => {
  assert.equal(evaluate(message('discord.gg/abc'), { enabled: false, blockInvites: true }), null);
  assert.equal(evaluate(message('discord.gg/abc'), { enabled: true, blockInvites: true, ignoredChannelIds: ['c1'] }), null);
});

test('short shouty messages are left alone', () => {
  const cfg = { enabled: true, maxCapsPercent: 70 };
  assert.equal(evaluate(message('OK'), cfg), null, 'two letters is not shouting');
  assert.equal(evaluate(message('LOL THAT IS FUNNY'), cfg)?.rule, 'caps');
});

test('repeats only count inside the window', () => {
  const cfg = { enabled: true, blockRepeats: true };
  const memory = new Map();
  assert.equal(evaluate(message('same'), cfg, memory), null, 'first time is fine');
  assert.equal(evaluate(message('same'), cfg, memory)?.rule, 'spam');
  memory.set('u1', { text: 'same', at: Date.now() - 60_000 });
  assert.equal(evaluate(message('same'), cfg, memory), null, 'a minute later is not spam');
});

test('escalation climbs warn → timeout → kick', () => {
  const ladder = { escalation: { timeoutAt: 3, timeoutMinutes: 60, kickAt: 6 } };
  assert.equal(escalationFor(1, ladder).action, 'none');
  assert.equal(escalationFor(3, ladder).action, 'timeout');
  assert.equal(escalationFor(3, ladder).minutes, 60);
  assert.equal(escalationFor(6, ladder).action, 'kick');
});

test('every automod rule is reachable by id', () => {
  assert.deepEqual(RULES.map((r) => r.id), ['invites', 'links', 'mentions', 'caps', 'words', 'spam']);
});

// ── giveaways ─────────────────────────────────────────────────────────────
test('the draw picks distinct winners and never over-draws', () => {
  const entrants = ['a', 'b', 'c', 'd'];
  const winners = draw(entrants, 3, () => 0.5);
  assert.equal(winners.length, 3);
  assert.equal(new Set(winners).size, 3, 'nobody wins twice');
  assert.deepEqual(draw(['solo'], 5, () => 0).length, 1, 'cannot draw more than entered');
  assert.deepEqual(draw([], 2, () => 0), []);
});

test('the draw is not biased to the front of the list', () => {
  const counts = {};
  for (let i = 0; i < 400; i++) {
    // a rolling pseudo-random source, so the sampling actually varies
    let seed = i;
    const roll = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (const winner of draw(['a', 'b', 'c', 'd'], 1, roll)) counts[winner] = (counts[winner] ?? 0) + 1;
  }
  for (const name of ['a', 'b', 'c', 'd']) {
    assert.ok(counts[name] > 40, `${name} won only ${counts[name] ?? 0} of 400 — looks biased`);
  }
});

// ── reminders ─────────────────────────────────────────────────────────────
test('durations parse the ways people actually write them', () => {
  assert.equal(parseDuration('30m'), 1_800_000);
  assert.equal(parseDuration('2h'), 7_200_000);
  assert.equal(parseDuration('1h30m'), 5_400_000);
  assert.equal(parseDuration('3 days'), 259_200_000);
  assert.equal(parseDuration('1 week'), 604_800_000);
  assert.equal(parseDuration('soon'), null);
  assert.equal(parseDuration(''), null);
});

// ── role menus ────────────────────────────────────────────────────────────
test('role panels split across rows and drop invalid entries', () => {
  const panel = {
    id: 'notifs', title: 'Notifications',
    roles: [
      ...Array.from({ length: 7 }, (_, i) => ({ roleId: String(100000000000000000 + i), label: `Role ${i}` })),
      { roleId: 'not-an-id', label: 'Broken' },
    ],
  };
  const rows = panelButtons(panel);
  assert.equal(rows.length, 2, '7 valid roles is two rows');
  assert.equal(rows[0].toJSON().components.length, 5);
  assert.equal(rows[1].toJSON().components.length, 2, 'the malformed id is gone');
  assert.match(panelEmbed(panel).toJSON().title, /Notifications/);
});

test('a bad emoji on a panel costs the icon, not the button', () => {
  const panel = { id: 'p', roles: [{ roleId: '100000000000000000', label: 'X', emoji: '𝕏' }] };
  const [button] = panelButtons(panel)[0].toJSON().components;
  assert.equal(button.emoji, undefined);
  assert.equal(button.label, 'X');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}\n  ${err.message}`);
  }
}
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) failed` : `\nall ${tests.length} tests passed`);
process.exit(failed ? 1 : 0);

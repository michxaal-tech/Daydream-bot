/**
 * The optional features. Pure logic only — no Discord, no network.
 *
 *   node test/extras.test.js
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'daydream-extras-'));
process.env.DATA_DIR = dir;

const { config } = await import('../src/lib/config.js');
const economy = await import('../src/features/economy/index.js');
const profiles = await import('../src/features/profiles/index.js');
const community = await import('../src/features/community/index.js');
const fun = await import('../src/features/fun/index.js');
const channels = await import('../src/features/autochannel/index.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const DAY = 86_400_000;

// ── economy ───────────────────────────────────────────────────────────────
test('the daily claim pays out once per day', () => {
  config.economy = { enabled: true, dailyAmount: 100, streakBonus: 25, maxStreakBonusDays: 7 };
  const user = 'daily-1';
  const first = economy.claimDaily(user, { now: DAY });
  assert.equal(first.ok, true);
  assert.equal(first.earned, 100, 'day one has no bonus');

  const again = economy.claimDaily(user, { now: DAY + 3600_000 });
  assert.equal(again.ok, false, 'same day is refused');
  assert.ok(again.waitMs > 0);
  assert.equal(economy.wallet(user).balance, 100, 'and pays nothing');
});

test('a streak builds, and breaks if you skip a day', () => {
  config.economy = { enabled: true, dailyAmount: 100, streakBonus: 25, maxStreakBonusDays: 7 };
  const user = 'daily-2';
  economy.claimDaily(user, { now: DAY });
  const second = economy.claimDaily(user, { now: 2 * DAY });
  assert.equal(second.wallet.streak, 2);
  assert.equal(second.bonus, 25, 'one day of streak, one bonus step');

  // skip a day entirely — more than 48h since the last claim
  const broken = economy.claimDaily(user, { now: 5 * DAY });
  assert.equal(broken.wallet.streak, 1, 'streak resets');
  assert.equal(broken.bonus, 0);
});

test('the streak bonus stops climbing at the cap', () => {
  config.economy = { enabled: true, dailyAmount: 100, streakBonus: 25, maxStreakBonusDays: 3 };
  const user = 'daily-3';
  let last;
  for (let day = 1; day <= 8; day++) last = economy.claimDaily(user, { now: day * DAY });
  assert.equal(last.bonus, 75, '3 capped steps × 25');
});

test('paying moves coins and refuses what you cannot cover', () => {
  config.economy = { enabled: true };
  economy.setWallet('rich', { balance: 500, streak: 0, lastDaily: 0, claims: 0 });
  economy.setWallet('poor', { balance: 0, streak: 0, lastDaily: 0, claims: 0 });

  economy.transfer('rich', 'poor', 200);
  assert.equal(economy.wallet('rich').balance, 300);
  assert.equal(economy.wallet('poor').balance, 200);

  assert.throws(() => economy.transfer('poor', 'rich', 999), /only have 200/);
  assert.throws(() => economy.transfer('rich', 'rich', 10), /yourself/);
  assert.throws(() => economy.transfer('rich', 'poor', -5), /above zero/);
});

test('buying deducts once and refuses when short', () => {
  config.economy = { enabled: true, shop: [{ id: 'vip', name: 'VIP', price: 250, roleId: '1' }] };
  economy.setWallet('buyer', { balance: 300, streak: 0, lastDaily: 0, claims: 0 });
  economy.buy('buyer', 'vip');
  assert.equal(economy.wallet('buyer').balance, 50);
  assert.throws(() => economy.buy('buyer', 'vip'), /costs 250/);
  assert.throws(() => economy.buy('buyer', 'nope'), /not in the shop/);
});

// ── birthdays ─────────────────────────────────────────────────────────────
test('birthdays store month and day only, and reject impossible dates', () => {
  assert.equal(profiles.setBirthday('b1', 3, 14), '03-14');
  assert.equal(profiles.getBirthday('b1'), '03-14');
  assert.equal(profiles.setBirthday('b2', 2, 29), '02-29', 'leap day is a real birthday');
  assert.throws(() => profiles.setBirthday('b3', 2, 30), /doesn't exist/);
  assert.throws(() => profiles.setBirthday('b4', 4, 31), /doesn't exist/);
});

test('birthdays due today are found, and the upcoming list wraps the year', () => {
  profiles.setBirthday('today-1', 6, 15);
  profiles.setBirthday('later-1', 6, 20);
  profiles.setBirthday('wrapped', 1, 5);
  assert.deepEqual(profiles.birthdaysOn(new Date(Date.UTC(2026, 5, 15))), ['today-1']);

  const upcoming = profiles.upcomingBirthdays(3, new Date(Date.UTC(2026, 5, 15)));
  assert.equal(upcoming[0].userId, 'today-1', 'today comes first');
  assert.equal(upcoming[1].userId, 'later-1');
  assert.equal(upcoming[2].userId, 'wrapped', 'january is next year, not last');
});

// ── counting ──────────────────────────────────────────────────────────────
test('counting accepts the next number and rejects everything else', () => {
  const state = { current: 41, lastUserId: 'a', best: 100 };
  assert.deepEqual(community.evaluateCount('42', 'b', state, {}), { action: 'accept', next: 42, record: false });
  assert.equal(community.evaluateCount('43', 'b', state, {}).action, 'reset', 'skipping a number breaks it');
  assert.equal(community.evaluateCount('nope', 'b', state, {}).action, 'ignore', 'chatter is ignored');
  assert.equal(community.evaluateCount('42 nice', 'b', state, {}).action, 'accept', 'a trailing word is fine');
});

test('counting stops the same person going twice', () => {
  const state = { current: 41, lastUserId: 'a', best: 100 };
  assert.equal(community.evaluateCount('42', 'a', state, {}).action, 'reset');
  assert.equal(community.evaluateCount('42', 'a', state, { noDoubles: false }).action, 'accept');
});

test('counting flags a new record', () => {
  const state = { current: 100, lastUserId: 'a', best: 100 };
  assert.equal(community.evaluateCount('101', 'b', state, {}).record, true);
});

// ── fun ───────────────────────────────────────────────────────────────────
test('dice notation parses, clamps and sums', () => {
  const roll = fun.rollDice('2d6', () => 0.5);
  assert.equal(roll.count, 2);
  assert.equal(roll.sides, 6);
  assert.equal(roll.total, roll.rolls.reduce((a, b) => a + b, 0));
  assert.equal(fun.rollDice('d20', () => 0).count, 1, 'a bare d20 is one die');
  assert.equal(fun.rollDice('999d6', () => 0).count, 25, 'clamped so nobody spams 999 dice');
  assert.equal(fun.rollDice('banana'), null);
});

test('dice results stay inside their range', () => {
  for (const value of [0, 0.001, 0.5, 0.999]) {
    const { rolls } = fun.rollDice('1d6', () => value);
    assert.ok(rolls[0] >= 1 && rolls[0] <= 6, `${value} gave ${rolls[0]}`);
  }
});

test('choices split on commas and pipes', () => {
  assert.deepEqual(fun.parseChoices('pizza, burgers , tacos'), ['pizza', 'burgers', 'tacos']);
  assert.deepEqual(fun.parseChoices('a|b'), ['a', 'b']);
  assert.deepEqual(fun.parseChoices('  '), []);
});

test('timestamps parse the phrasings the command advertises', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  assert.equal(fun.parseWhen('in 2 hours', now).toISOString(), '2026-08-18T14:00:00.000Z');
  assert.equal(fun.parseWhen('in 30 minutes', now).toISOString(), '2026-08-18T12:30:00.000Z');
  assert.ok(fun.parseWhen('2026-09-01 18:30', now) instanceof Date);
  assert.equal(fun.parseWhen('whenever', now), null);
});

test('discord timestamp markup is seconds, not milliseconds', () => {
  const stamp = fun.discordTimestamp(new Date('2026-08-18T12:00:00Z'), 'R');
  assert.equal(stamp, '<t:1787054400:R>');
  assert.equal(new Date(1787054400 * 1000).toISOString(), '2026-08-18T12:00:00.000Z');
});

// ── channel automation ────────────────────────────────────────────────────
test('slowmode rises on a spike and falls when it calms down', () => {
  const cfg = { autoSlowmode: true, slowmodeAt: 20, slowmodeSeconds: 10 };
  assert.equal(channels.slowmodeFor(25, cfg, 0), 10, 'busy channel gets slowmode');
  assert.equal(channels.slowmodeFor(25, cfg, 10), null, 'already slowed — leave it alone');
  assert.equal(channels.slowmodeFor(5, cfg, 10), 0, 'quiet again — lift it');
  assert.equal(channels.slowmodeFor(15, cfg, 10), null, 'in between — no thrash');
  assert.equal(channels.slowmodeFor(99, { autoSlowmode: false }, 0), null, 'off means off');
});

test('the message rate only counts the last minute', () => {
  const memory = new Map();
  const now = 1_000_000;
  for (let i = 0; i < 5; i++) channels.messageRate('c', now - 90_000, memory);
  assert.equal(channels.messageRate('c', now, memory), 1, 'older than a minute is dropped');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (err) { failed++; console.error(`✗ ${name}\n  ${err.message}`); }
}
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) failed` : `\nall ${tests.length} tests passed`);
process.exit(failed ? 1 : 0);

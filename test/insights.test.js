/**
 * Analytics, attribution, superfans and the creator tools.
 *
 *   node test/insights.test.js
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'daydream-insights-'));
process.env.DATA_DIR = dir;

const { config } = await import('../src/lib/config.js');
const a = await import('../src/features/analytics/index.js');
const { withinWindow } = await import('../src/features/firsthour/index.js');
const shoutouts = await import('../src/features/shoutouts/index.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const HOUR = 3_600_000;

test('message buckets fill the whole window, gaps included', () => {
  const now = new Date('2026-08-18T12:30:00Z');
  a.recordMessage(now);
  a.recordMessage(now);
  a.recordMessage(new Date(now.getTime() - 2 * HOUR));

  const series = a.messagesPerHour(4, now);
  assert.equal(series.length, 4, 'always a full series, so a sparkline never jumps');
  assert.deepEqual(series.map((p) => p.value), [0, 1, 0, 2]);
});

test('joins per day counts by calendar day', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  a.recordJoin({ userId: 'j1', at: now.getTime() });
  a.recordJoin({ userId: 'j2', at: now.getTime() - 3 * HOUR });
  a.recordJoin({ userId: 'j3', at: now.getTime() - 30 * HOUR });

  const series = a.joinsPerDay(3, now);
  assert.deepEqual(series.map((p) => p.value), [0, 1, 2]);
});

test('attribution counts joins inside the window and ignores the rest', () => {
  const uploadAt = Date.parse('2026-08-18T10:00:00Z');
  const uploads = [{ accountId: 'yt', platform: 'youtube', title: 'the video', url: 'u', at: uploadAt, messageId: 'm1' }];
  const joins = [
    { userId: '1', at: uploadAt + HOUR, inviteCode: 'abc' },
    { userId: '2', at: uploadAt + 3 * HOUR, inviteCode: 'abc' },
    { userId: '3', at: uploadAt + 30 * HOUR, inviteCode: 'xyz' },  // past the window
    { userId: '4', at: uploadAt - HOUR, inviteCode: 'abc' },       // before the upload
  ];
  const [row] = a.attribution({ windowHours: 24, uploads, joins });
  assert.equal(row.joins, 2);
  assert.equal(row.topInvite, 'abc', 'names the link most of them came through');
});

test('attribution handles an upload nobody arrived after', () => {
  const uploads = [{ title: 'flop', url: 'u', at: 1000, messageId: 'm' }];
  const [row] = a.attribution({ windowHours: 24, uploads, joins: [] });
  assert.equal(row.joins, 0);
  assert.equal(row.topInvite, null);
});

test('invite performance ranks links and keeps the inviter', () => {
  const rows = a.invitePerformance([
    { inviteCode: 'abc', inviterTag: 'mike' }, { inviteCode: 'abc', inviterTag: 'mike' },
    { inviteCode: 'xyz', inviterTag: 'luna' }, { inviteCode: null },
  ]);
  assert.equal(rows[0].code, 'abc');
  assert.equal(rows[0].joins, 2);
  assert.equal(rows[0].inviterTag, 'mike');
  assert.ok(rows.some((r) => r.code === 'unknown'), 'untracked joins still show up');
});

test('the activity grid is 7×24 and lands hours in the right slot', () => {
  const now = new Date('2026-08-19T15:00:00Z'); // a Wednesday
  a.recordMessage(now);
  a.recordMessage(now);
  const grid = a.activityGrid(1, now);
  assert.equal(grid.length, 7);
  assert.equal(grid[0].length, 24);
  assert.ok(grid[3][15] >= 2, 'Wednesday 15:00 UTC should hold those messages');
});

test('best slots rank by volume and read as human times', () => {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  grid[5][20] = 90;
  grid[2][9] = 40;
  const [first, second] = a.bestSlots(grid, 2);
  assert.equal(first.value, 90);
  assert.equal(first.label, 'Friday 20:00 UTC');
  assert.equal(second.label, 'Tuesday 09:00 UTC');
  assert.deepEqual(a.bestSlots(Array.from({ length: 7 }, () => Array(24).fill(0))), [], 'no data, no claims');
});

test('the superfan score weights doing over talking', () => {
  a.recordEngagement('fan', 'firstHour', 2);   // 2 × 5 = 10
  a.recordEngagement('fan', 'stars', 3);       // 3 × 3 = 9
  a.recordEngagement('fan', 'giveaways', 1);   // 1 × 2 = 2
  assert.equal(a.superfanScore('fan', 500), 26, '10 + 9 + 2 + 5 xp points');

  // A talker with far more xp but no participation should still rank lower.
  assert.ok(a.superfanScore('fan', 500) > a.superfanScore('silent', 2000));
});

test('superfans ranks and drops people with no score', () => {
  a.recordEngagement('quiet-fan', 'stars', 1);
  const rows = a.superfans({ 'quiet-fan': { xp: 0 }, nobody: { xp: 0 } }, 10);
  assert.ok(rows.some((r) => r.userId === 'quiet-fan'));
  assert.ok(!rows.some((r) => r.userId === 'nobody'), 'zero score means not listed');
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].score >= rows[i].score, 'sorted');
});

test('the first-hour window opens and closes', () => {
  const at = Date.parse('2026-08-18T10:00:00Z');
  const uploads = [{ messageId: 'm1', at, title: 't', url: 'u' }];
  const cfg = { windowMinutes: 60 };
  assert.ok(withinWindow('m1', { now: at + 30 * 60_000, uploads, cfg }), 'inside the hour counts');
  assert.equal(withinWindow('m1', { now: at + 90 * 60_000, uploads, cfg }), null, 'after it does not');
  assert.equal(withinWindow('other', { now: at, uploads, cfg }), null, 'other messages are not uploads');
});

test('the shoutout queue enforces one per person and sorts by votes', () => {
  config.shoutouts = { enabled: true, perPersonLimit: 1 };
  const first = shoutouts.submit({ userId: 'u1', userTag: 'one', text: 'play my song' });
  assert.throws(() => shoutouts.submit({ userId: 'u1', userTag: 'one', text: 'again' }), /already have/);

  shoutouts.submit({ userId: 'u2', userTag: 'two', text: 'shout my dog out' });
  shoutouts.markRead(first.id);
  assert.equal(shoutouts.pending().length, 1, 'read ones leave the queue');
  assert.ok(shoutouts.submit({ userId: 'u1', userTag: 'one', text: 'now I can again' }), 'and free up the slot');
});

test('next() hands over one and clears it', () => {
  config.shoutouts = { enabled: true, perPersonLimit: 5 };
  const before = shoutouts.pending().length;
  const taken = shoutouts.next();
  assert.ok(taken);
  assert.equal(shoutouts.pending().length, before - 1);
});

test('the queue refuses submissions when it is off', () => {
  config.shoutouts = { enabled: false };
  assert.throws(() => shoutouts.submit({ userId: 'x', userTag: 'x', text: 'hi' }), /closed/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (err) { failed++; console.error(`✗ ${name}\n  ${err.message}`); }
}
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) failed` : `\nall ${tests.length} tests passed`);
process.exit(failed ? 1 : 0);

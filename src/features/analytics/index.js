/**
 * The numbers that make this bot worth more than a notification relay.
 *
 * Everything here is derived from events the bot already sees — uploads it
 * announced, members joining, messages arriving, reactions given. Nothing is
 * collected that wasn't already passing through, and nothing leaves the server.
 */
import { collection, getIn, setIn } from '../../lib/store.js';
import { config } from '../../lib/config.js';

const BUCKETS = 'analyticsBuckets';   // messages per hour, joins per day
const EVENTS = 'analyticsEvents';     // joins and uploads, with timestamps
const ENGAGE = 'analyticsEngagement'; // per-member tallies

const MAX_JOINS = 800;
const MAX_UPLOADS = 120;

const hourKey = (d = new Date()) => `${d.toISOString().slice(0, 13)}`; // YYYY-MM-DDTHH
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/* ── recording ─────────────────────────────────────────────────────────── */

export function recordMessage(at = new Date()) {
  const key = `msg:${hourKey(at)}`;
  setIn(BUCKETS, key, (getIn(BUCKETS, key, 0) ?? 0) + 1);
}

export function recordJoin({ userId, inviteCode = null, inviterTag = null, at = Date.now() }) {
  const key = `join:${dayKey(new Date(at))}`;
  setIn(BUCKETS, key, (getIn(BUCKETS, key, 0) ?? 0) + 1);

  const joins = getIn(EVENTS, 'joins', []);
  joins.unshift({ userId, inviteCode, inviterTag, at });
  setIn(EVENTS, 'joins', joins.slice(0, MAX_JOINS));
}

export function recordUpload({ accountId, platform, title, url, messageId, channelId, at = Date.now() }) {
  const uploads = getIn(EVENTS, 'uploads', []);
  uploads.unshift({ accountId, platform, title, url, messageId, channelId, at });
  setIn(EVENTS, 'uploads', uploads.slice(0, MAX_UPLOADS));
  return uploads[0];
}

export const recentUploads = (limit = 20) => getIn(EVENTS, 'uploads', []).slice(0, limit);
export const recentJoins = (limit = 50) => getIn(EVENTS, 'joins', []).slice(0, limit);

/** Bump one engagement counter for a member. */
export function recordEngagement(userId, kind, amount = 1) {
  const current = getIn(ENGAGE, userId, {});
  setIn(ENGAGE, userId, { ...current, [kind]: (current[kind] ?? 0) + amount });
}

/* ── series for the sparklines ─────────────────────────────────────────── */

/** Messages per hour for the last N hours, oldest first. Always full length. */
export function messagesPerHour(hours = 24, now = new Date()) {
  const series = [];
  for (let i = hours - 1; i >= 0; i--) {
    const at = new Date(now.getTime() - i * 3_600_000);
    series.push({ label: at.toISOString().slice(11, 13), value: getIn(BUCKETS, `msg:${hourKey(at)}`, 0) ?? 0 });
  }
  return series;
}

export function joinsPerDay(days = 30, now = new Date()) {
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = new Date(now.getTime() - i * 86_400_000);
    series.push({ label: dayKey(at).slice(5), value: getIn(BUCKETS, `join:${dayKey(at)}`, 0) ?? 0 });
  }
  return series;
}

/* ── drop radar ────────────────────────────────────────────────────────── */

/**
 * When is this server actually awake? A 7×24 grid of message counts, built
 * from the hourly buckets we already keep. Answers "when should I publish"
 * with your own audience rather than a generic best-practices post.
 */
export function activityGrid(weeks = 4, now = new Date()) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (let i = 0; i < weeks * 7 * 24; i++) {
    const at = new Date(now.getTime() - i * 3_600_000);
    const value = getIn(BUCKETS, `msg:${hourKey(at)}`, 0) ?? 0;
    if (value) grid[at.getUTCDay()][at.getUTCHours()] += value;
  }
  return grid;
}

/** The single busiest hour, and the top three, as human-readable slots. */
export function bestSlots(grid = activityGrid(), limit = 3) {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const flat = [];
  grid.forEach((row, day) => row.forEach((value, hour) => flat.push({ day, hour, value })));
  return flat
    .filter((slot) => slot.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((slot) => ({ ...slot, label: `${DAYS[slot.day]} ${String(slot.hour).padStart(2, '0')}:00 UTC` }));
}

/* ── upload → join attribution ─────────────────────────────────────────── */

/**
 * How many people joined in the window after each upload.
 *
 * This is correlation, not proof — someone joining an hour after a video went
 * up probably came from it, but nothing guarantees that. Treat it as a signal
 * about which content pulls, not as an exact count.
 */
export function attribution({ windowHours = null, uploads = recentUploads(20), joins = getIn(EVENTS, 'joins', []) } = {}) {
  const window = (windowHours ?? config.analytics?.attributionWindowHours ?? 24) * 3_600_000;

  return uploads.map((upload) => {
    const inWindow = joins.filter((join) => join.at >= upload.at && join.at < upload.at + window);
    const byInvite = {};
    for (const join of inWindow) {
      const code = join.inviteCode ?? 'unknown';
      byInvite[code] = (byInvite[code] ?? 0) + 1;
    }
    return {
      ...upload,
      joins: inWindow.length,
      topInvite: Object.entries(byInvite).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    };
  });
}

/** Total joins per invite code, so you can see which link is doing the work. */
export function invitePerformance(joins = getIn(EVENTS, 'joins', [])) {
  const tally = {};
  for (const join of joins) {
    const code = join.inviteCode ?? 'unknown';
    tally[code] ??= { code, joins: 0, inviterTag: join.inviterTag };
    tally[code].joins++;
  }
  return Object.values(tally).sort((a, b) => b.joins - a.joins);
}

/* ── superfan score ────────────────────────────────────────────────────── */

/**
 * One number for "how invested is this person", from things they chose to do
 * rather than things that just happened. Talking counts least — it's the
 * easiest — and being early to an upload counts most.
 */
export const WEIGHTS = {
  xpPer100: 1,   // 100 xp ≈ one point
  stars: 3,      // gave a message a star
  firstHour: 5,  // reacted within an hour of an upload
  giveaways: 2,  // entered a giveaway
  suggestions: 1,// voted on a suggestion
  shoutouts: 1,  // submitted a shoutout
};

export function superfanScore(userId, xp = 0) {
  const e = getIn(ENGAGE, userId, {});
  return Math.round(
    (xp / 100) * WEIGHTS.xpPer100 +
      (e.stars ?? 0) * WEIGHTS.stars +
      (e.firstHour ?? 0) * WEIGHTS.firstHour +
      (e.giveaways ?? 0) * WEIGHTS.giveaways +
      (e.suggestions ?? 0) * WEIGHTS.suggestions +
      (e.shoutouts ?? 0) * WEIGHTS.shoutouts
  );
}

export function superfans(xpLookup, limit = 10) {
  const ids = new Set([...Object.keys(collection(ENGAGE)), ...Object.keys(xpLookup ?? {})]);
  return [...ids]
    .map((userId) => {
      const e = getIn(ENGAGE, userId, {});
      const xp = xpLookup?.[userId]?.xp ?? 0;
      return { userId, xp, ...e, score: superfanScore(userId, xp) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Housekeeping: hourly buckets older than 60 days are dead weight. */
export function prune(now = new Date()) {
  const cutoffHour = `msg:${hourKey(new Date(now.getTime() - 60 * 86_400_000))}`;
  const cutoffDay = `join:${dayKey(new Date(now.getTime() - 400 * 86_400_000))}`;
  let removed = 0;
  for (const [key] of Object.entries(collection(BUCKETS))) {
    const stale = key.startsWith('msg:') ? key < cutoffHour : key.startsWith('join:') ? key < cutoffDay : false;
    if (stale) { delete collection(BUCKETS)[key]; removed++; }
  }
  return removed;
}

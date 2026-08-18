/**
 * Dead-simple JSON persistence. Enough for "which posts have we already
 * announced" and per-guild overrides; swap for SQLite/Redis if the server
 * grows past a few thousand tracked posts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const FILE = resolve(process.cwd(), 'data', 'store.json');
let cache = null;
let flushTimer = null;

function load() {
  if (cache) return cache;
  if (existsSync(FILE)) {
    try {
      cache = JSON.parse(readFileSync(FILE, 'utf8'));
    } catch {
      cache = {};
    }
  } else {
    cache = {};
  }
  cache.seen ??= {};
  cache.meta ??= {};
  return cache;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(cache, null, 2));
  }, 250);
  flushTimer.unref?.();
}

/** Has this account's post already been announced? */
export function hasSeen(accountId, postId) {
  const db = load();
  return Boolean(db.seen[accountId]?.includes(postId));
}

/** Remember a post id, keeping the most recent 50 per account. */
export function markSeen(accountId, postId) {
  const db = load();
  db.seen[accountId] ??= [];
  if (!db.seen[accountId].includes(postId)) {
    db.seen[accountId].unshift(postId);
    db.seen[accountId] = db.seen[accountId].slice(0, 50);
  }
  scheduleFlush();
}

export function markSeenBulk(accountId, postIds) {
  postIds.forEach((id) => markSeen(accountId, id));
}

export function isSeeded(accountId) {
  return Boolean(load().meta[`seeded:${accountId}`]);
}

export function markSeeded(accountId) {
  load().meta[`seeded:${accountId}`] = new Date().toISOString();
  scheduleFlush();
}

export function getMeta(key, fallback = null) {
  return load().meta[key] ?? fallback;
}

export function setMeta(key, value) {
  load().meta[key] = value;
  scheduleFlush();
}

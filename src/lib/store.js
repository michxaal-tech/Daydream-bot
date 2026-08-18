/**
 * Dead-simple JSON persistence. Enough for "which posts have we already
 * announced" and per-guild overrides; swap for SQLite/Redis if the server
 * grows past a few thousand tracked posts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { env } from './config.js';

const FILE = resolve(
  isAbsolute(env.dataDir) ? env.dataDir : resolve(process.cwd(), env.dataDir),
  'store.json'
);
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
  cache.data ??= {};
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

/* ── generic collections ───────────────────────────────────────────────────
   Everything that isn't "have we announced this post" lives here: xp, warning
   cases, giveaways, starboard links, reminders. Each collection is a plain
   object keyed by id, which is enough for a single community server. Swap the
   backing store for SQLite if one ever outgrows a JSON file.               */

export function collection(name) {
  const db = load();
  db.data[name] ??= {};
  return db.data[name];
}

export function getIn(name, key, fallback = null) {
  return collection(name)[key] ?? fallback;
}

export function setIn(name, key, value) {
  collection(name)[key] = value;
  scheduleFlush();
  return value;
}

/** Read-modify-write in one call, so callers can't forget to persist. */
export function updateIn(name, key, mutate, seed = {}) {
  const current = collection(name)[key] ?? structuredClone(seed);
  const next = mutate(current) ?? current;
  return setIn(name, key, next);
}

export function deleteIn(name, key) {
  delete collection(name)[key];
  scheduleFlush();
}

export function entries(name) {
  return Object.entries(collection(name));
}

/** Monotonic per-name counter — case numbers, mostly. */
export function nextId(name) {
  const db = load();
  const key = `counter:${name}`;
  db.meta[key] = (db.meta[key] ?? 0) + 1;
  scheduleFlush();
  return db.meta[key];
}

export function getMeta(key, fallback = null) {
  return load().meta[key] ?? fallback;
}

export function setMeta(key, value) {
  load().meta[key] = value;
  scheduleFlush();
}

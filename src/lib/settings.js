/**
 * Live settings.
 *
 * config.json in the repo is the *default*. Anything changed at runtime — by a
 * /setup command or the dashboard — is written to <DATA_DIR>/settings.json and
 * merged over those defaults, in place, into the same `config` object every
 * feature already imports. That means no feature code has to know settings can
 * change, and a redeploy never clobbers what you configured from Discord.
 *
 * Objects merge key by key; arrays are replaced wholesale, because an account
 * list that half-merges is worse than one that's simply overwritten.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { config, env } from './config.js';
import { logger } from './logger.js';

const log = logger('settings');

const FILE = resolve(
  isAbsolute(env.dataDir) ? env.dataDir : resolve(process.cwd(), env.dataDir),
  'settings.json'
);

let overrides = {};
const listeners = new Set();

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Merge `patch` into `target` in place. Arrays replace; objects recurse. */
function mergeInto(target, patch) {
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) continue;
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) target[key] = {};
      mergeInto(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));

/** Read the saved overrides and apply them. Call once, at boot. */
export function loadSettings() {
  if (existsSync(FILE)) {
    try {
      overrides = JSON.parse(readFileSync(FILE, 'utf8'));
      mergeInto(config, overrides);
      log.info(`applied saved settings from ${FILE}`);
    } catch (err) {
      log.error(`could not read ${FILE} — falling back to config.json defaults:`, err.message);
      overrides = {};
    }
  }
  return config;
}

/**
 * Apply a partial settings change: persist it, merge it into the live config,
 * and tell anything that cares. Returns the updated live config.
 */
export function updateSettings(patch, { who = 'unknown' } = {}) {
  mergeInto(overrides, clone(patch));
  mergeInto(config, clone(patch));

  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(overrides, null, 2)}\n`);
  log.info(`settings updated by ${who}: ${summarize(patch)}`);

  for (const fn of listeners) {
    try {
      fn(config, patch);
    } catch (err) {
      log.warn('settings listener threw:', err.message);
    }
  }
  return config;
}

/** Forget every runtime change and go back to config.json as committed. */
export function resetSettings({ who = 'unknown' } = {}) {
  overrides = {};
  if (existsSync(FILE)) writeFileSync(FILE, '{}\n');
  log.warn(`settings reset to config.json defaults by ${who} — restart to reload`);
}

/** Subscribe to changes — the watcher uses this to pick up a new poll interval. */
export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** What's been overridden, as saved. Useful for the dashboard's "modified" marks. */
export function getOverrides() {
  return clone(overrides);
}

/** Human-readable "welcome.channelId, notifications.accounts" for the log line. */
function summarize(patch, prefix = '') {
  return Object.entries(patch ?? {})
    .flatMap(([key, value]) =>
      isPlainObject(value) ? summarize(value, `${prefix}${key}.`) : [`${prefix}${key}`]
    )
    .join(', ');
}

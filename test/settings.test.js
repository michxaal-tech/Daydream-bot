/**
 * The settings layer merges saved overrides over config.json in place, so every
 * feature that imported `config` sees the change without re-importing.
 *
 *   node test/settings.test.js
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Point DATA_DIR at a throwaway directory before anything reads it.
const dir = mkdtempSync(join(tmpdir(), 'daydream-settings-'));
process.env.DATA_DIR = dir;

const { config } = await import('../src/lib/config.js');
const { updateSettings, loadSettings, getOverrides, resetSettings } = await import('../src/lib/settings.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('an update lands on the live config object features already hold', () => {
  const held = config; // what a feature module captured at import time
  updateSettings({ welcome: { channelId: '999' } }, { who: 'test' });
  assert.equal(held.welcome.channelId, '999', 'the same object reference must see it');
});

test('nested objects merge, siblings survive', () => {
  updateSettings({ welcome: { sendDm: true } }, { who: 'test' });
  assert.equal(config.welcome.channelId, '999', 'earlier change should not be wiped');
  assert.equal(config.welcome.sendDm, true);
  assert.ok(Array.isArray(config.welcome.greetings), 'untouched keys stay put');
});

test('arrays replace instead of merging', () => {
  updateSettings({ notifications: { accounts: [{ id: 'only', platform: 'youtube' }] } }, { who: 'test' });
  assert.equal(config.notifications.accounts.length, 1);
  assert.equal(config.notifications.accounts[0].id, 'only');
});

test('changes persist to disk and reload', () => {
  const saved = JSON.parse(readFileSync(resolve(dir, 'settings.json'), 'utf8'));
  assert.equal(saved.welcome.channelId, '999');
  assert.deepEqual(Object.keys(getOverrides()).sort(), ['notifications', 'welcome']);
  loadSettings();
  assert.equal(config.welcome.channelId, '999', 'reload is idempotent');
});

test('reset clears the overrides file', () => {
  resetSettings({ who: 'test' });
  assert.deepEqual(getOverrides(), {});
  assert.equal(readFileSync(resolve(dir, 'settings.json'), 'utf8').trim(), '{}');
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

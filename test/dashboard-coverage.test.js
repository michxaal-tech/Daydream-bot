/**
 * Every setting must be reachable from the dashboard.
 *
 * Features kept arriving with their config in place and no way to switch them
 * on without editing JSON — which is the exact thing the dashboard exists to
 * replace. This test fails the build when a new config key has no control.
 *
 * If a key genuinely belongs in the exceptions below, add it there *with a
 * reason*. An empty reason is not accepted.
 *
 *   node test/dashboard-coverage.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const config = JSON.parse(readFileSync(resolve('config.json'), 'utf8'));
const dashboard = readFileSync(resolve('src/web/public/index.html'), 'utf8');

/** key → why it needs no control of its own. */
const EXCEPTIONS = {
  'punishments.mutedRoleId': 'created by the Create mute roles button; shown as ready/not created',
  'punishments.imageMutedRoleId': 'same — created by the setup button, never typed in',
  'punishments.reactionMutedRoleId': 'same — created by the setup button, never typed in',
  'punishments.jailRoleId': 'created by the Create jail button; shown as ready/not created',
  'punishments.jailChannelId': 'created alongside the jail role',
};

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/** A key counts as covered if the dashboard reads or writes it anywhere. */
function covered(section, key) {
  return (
    dashboard.includes(`${section}.${key}`) ||
    dashboard.includes(`${section}[i].${key}`) ||
    dashboard.includes(`'${key}'`) ||
    dashboard.includes(`.${key} =`) ||
    dashboard.includes(`.${key} ??`)
  );
}

test('every config section appears on the dashboard', () => {
  const missing = Object.keys(config)
    .filter((section) => !section.startsWith('//'))
    .filter((section) => !dashboard.includes(`.${section}`) && !dashboard.includes(`'${section}'`));
  assert.deepEqual(missing, [], `these sections have no dashboard panel: ${missing.join(', ')}`);
});

test('every config key has a control, or a documented exception', () => {
  const gaps = [];
  for (const [section, value] of Object.entries(config)) {
    if (section.startsWith('//')) continue;
    if (typeof value !== 'object' || Array.isArray(value)) continue;

    for (const key of Object.keys(value)) {
      if (key.startsWith('//')) continue;
      const path = `${section}.${key}`;
      if (EXCEPTIONS[path]) {
        assert.ok(EXCEPTIONS[path].length > 10, `exception for ${path} needs a real reason`);
        continue;
      }
      if (!covered(section, key)) gaps.push(path);
    }
  }
  assert.deepEqual(
    gaps, [],
    `no dashboard control for: ${gaps.join(', ')}\n` +
      'Add one, or add the key to EXCEPTIONS with a reason.'
  );
});

test('every dashboard action the UI calls exists on the server', () => {
  const server = readFileSync(resolve('src/web/server.js'), 'utf8');
  const called = [...dashboard.matchAll(/action\('([a-z-]+)'/g)].map((m) => m[1]);
  const unique = [...new Set(called)];
  const missing = unique.filter((name) => !server.includes(`'${name}'`));
  assert.deepEqual(missing, [], `the dashboard calls actions the server does not handle: ${missing.join(', ')}`);
  assert.ok(unique.length >= 10, 'expected the dashboard to wire up a good number of actions');
});

test('every panel named in the tab list is implemented', () => {
  const tabIds = [...dashboard.matchAll(/\{ id: '([a-z]+)', label:/g)].map((m) => m[1]);
  const panelBlock = dashboard.slice(dashboard.indexOf('const PANELS = {'));
  const missing = tabIds.filter((id) => !panelBlock.includes(`${id}: render`));
  assert.deepEqual(missing, [], `tabs with no panel function: ${missing.join(', ')}`);
  assert.ok(tabIds.length >= 12, `expected the full tab set, found ${tabIds.length}`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (err) { failed++; console.error(`✗ ${name}\n  ${err.message}`); }
}
console.log(failed ? `\n${failed} test(s) failed` : `\nall ${tests.length} tests passed`);
process.exit(failed ? 1 : 0);

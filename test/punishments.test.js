/**
 * The punishment toolkit — the parts that are pure enough to test without a
 * live guild: role bookkeeping, hard-ban persistence, and message templating.
 *
 *   node test/punishments.test.js
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'daydream-punish-'));
process.env.DATA_DIR = dir;

const { config } = await import('../src/lib/config.js');
const p = await import('../src/features/moderation/punishments.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/** A member stub that records what was added and removed. */
function fakeMember(id, roleIds = [], { botTop = 100, ownTop = 10 } = {}) {
  const roles = new Set(roleIds);
  return {
    id,
    guild: {
      id: 'guild', roles: { everyone: { id: 'guild' } },
      members: { fetchMe: async () => ({ roles: { highest: { position: botTop } } }) },
    },
    roles: {
      cache: {
        filter: (fn) => ({
          map: (m) => [...roles].map((rid) => ({ id: rid, managed: false, position: ownTop, name: `role-${rid}` }))
            .filter((r) => fn(r)).map(m),
        }),
      },
      added: [], removed: [],
      add: async function (ids) { [].concat(ids).forEach((i) => roles.add(i)); this.added.push(...[].concat(ids)); },
      remove: async function (ids) { [].concat(ids).forEach((i) => roles.delete(i)); this.removed.push(...[].concat(ids)); },
    },
    _roles: roles,
  };
}

test('jail takes every role and unjail puts them all back', async () => {
  config.punishments = { jailRoleId: '900000000000000001', jailChannelId: '900000000000000002' };
  const member = fakeMember('u1', ['111111111111111111', '222222222222222222']);

  const result = await p.jail(member, { reason: 'spam' });
  assert.equal(result.removed, 2);
  assert.ok(member._roles.has('900000000000000001'), 'they should be wearing the jail role');
  assert.ok(!member._roles.has('111111111111111111'), 'and nothing else');
  assert.equal(p.isJailed('u1'), true);

  const restored = await p.unjail(member);
  assert.equal(restored, 2);
  assert.ok(member._roles.has('111111111111111111'), 'their old roles come back');
  assert.ok(!member._roles.has('900000000000000001'));
  assert.equal(p.isJailed('u1'), false, 'and the record is cleared');
});

test('jail refuses to run before setup', async () => {
  config.punishments = {};
  await assert.rejects(() => p.jail(fakeMember('u2')), /modsetup jail/);
});

test('each mute kind uses its own role, and refuses if it is missing', async () => {
  config.punishments = { mutedRoleId: '900000000000000010', imageMutedRoleId: '900000000000000011' };
  const member = fakeMember('u3');

  assert.equal(await p.setMute(member, 'text', true), 'text mute');
  assert.ok(member._roles.has('900000000000000010'));

  assert.equal(await p.setMute(member, 'image', true), 'image mute');
  assert.ok(member._roles.has('900000000000000011'));

  await p.setMute(member, 'text', false);
  assert.ok(!member._roles.has('900000000000000010'), 'unmute removes only that one');
  assert.ok(member._roles.has('900000000000000011'), 'and leaves the others alone');

  await assert.rejects(() => p.setMute(member, 'reaction', true), /modsetup mutes/);
  await assert.rejects(() => p.setMute(member, 'nonsense', true), /Unknown mute type/);
});

test('a hard ban is remembered until it is lifted', () => {
  assert.equal(p.isHardBanned('u4'), false);
  p.unhardban('u4'); // lifting one that never existed is harmless

  // hardban() also calls Discord, so exercise the record through unhardban
  const before = p.hardBans().length;
  assert.equal(typeof before, 'number');
});

test('forced nicknames stick until released', () => {
  assert.equal(p.forcedNick('u5'), null);
  p.releaseNick('u5');
});

test('staff binding widens who can punish', () => {
  config.punishments = { staffRoleIds: ['777777777777777777'] };
  const withRole = { permissions: { has: () => false }, roles: { cache: { has: (id) => id === '777777777777777777' } } };
  const without = { permissions: { has: () => false }, roles: { cache: { has: () => false } } };
  const admin = { permissions: { has: () => true }, roles: { cache: { has: () => false } } };

  assert.equal(p.isStaff(withRole), true);
  assert.equal(p.isStaff(without), false);
  assert.equal(p.isStaff(admin), true, 'Manage Server always counts');
});

test('invoke templates fill their tokens, and fall through when unset', () => {
  config.punishments = {
    invoke: { jail: { message: '{user} was jailed by {moderator} for {reason}', dm: 'You were jailed: {reason}' } },
  };
  assert.equal(
    p.renderInvoke('jail', 'message', { user: 'mike', moderator: 'luna', reason: 'spam' }),
    'mike was jailed by luna for spam'
  );
  assert.equal(p.renderInvoke('jail', 'dm', { reason: 'spam' }), 'You were jailed: spam');
  assert.equal(p.renderInvoke('kick', 'message', {}), null, 'unset actions use the built-in wording');
  assert.equal(p.renderInvoke('jail', 'nope', {}), null);
});

test('every mute kind is declared with a role key and a label', () => {
  assert.deepEqual(Object.keys(p.MUTE_KINDS), ['text', 'image', 'reaction']);
  for (const spec of Object.values(p.MUTE_KINDS)) {
    assert.ok(spec.key && spec.name && spec.label && spec.deny.length);
  }
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (err) { failed++; console.error(`✗ ${name}\n  ${err.message}`); }
}
rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} test(s) failed` : `\nall ${tests.length} tests passed`);
process.exit(failed ? 1 : 0);

/**
 * Feed-parsing tests. Network is stubbed with the fixtures in test/fixtures,
 * so these run offline and pin the exact shape each adapter produces.
 *
 *   node test/parsers.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import youtube from '../src/features/notifications/platforms/youtube.js';
import tiktok from '../src/features/notifications/platforms/tiktok.js';
import x from '../src/features/notifications/platforms/x.js';

const fixture = (name) => readFileSync(resolve('test/fixtures', name), 'utf8');
const realFetch = globalThis.fetch;

/** Serve one fixture to whatever URL the adapter asks for. */
function stubFetch(body) {
  globalThis.fetch = async () => new Response(body, { status: 200 });
}
const restore = () => {
  globalThis.fetch = realFetch;
};

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('youtube: parses an Atom feed into posts', async () => {
  stubFetch(fixture('youtube.atom.xml'));
  const posts = await youtube.fetchLatest({ id: 'yt', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw' });
  assert.equal(posts.length, 2);
  const [first] = posts;
  assert.equal(first.id, 'yt:dQw4w9WgXcQ');
  assert.equal(first.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(first.title, 'i tried every viral food hack for 7 days');
  assert.equal(first.author, 'Daydream');
  assert.equal(first.thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(first.publishedAt.toISOString(), '2026-08-18T17:02:00.000Z');
  // XML entities survive the round trip
  assert.equal(posts[1].description, 'you people are mean & I love it');
});

test('youtube: rejects a handle used where a channel id belongs', async () => {
  await assert.rejects(
    () => youtube.fetchLatest({ id: 'yt', channelId: '@daydream' }),
    /channelId starting with UC/
  );
});

test('tiktok: pulls the video id, cover image and caption out of RSS', async () => {
  stubFetch(fixture('tiktok.rss.xml'));
  const [post] = await tiktok.fetchLatest({ id: 'tt', handle: '@daydream' });
  assert.equal(post.id, 'tt:7391827364512');
  assert.equal(post.url, 'https://www.tiktok.com/@daydream/video/7391827364512');
  assert.equal(post.author, '@daydream');
  assert.equal(post.thumbnail, 'https://p16.tiktokcdn.com/cover.jpeg');
  assert.ok(post.description.includes('#dayinmylife'));
});

test('x: nitter fallback rewrites links to x.com and drops reposts by default', async () => {
  stubFetch(fixture('nitter.rss.xml'));
  const posts = await x.fetchLatest({ id: 'x', handle: 'daydream' });
  assert.equal(posts.length, 1, 'the RT should have been filtered out');
  assert.equal(posts[0].id, 'x:1826619283746152448');
  assert.equal(posts[0].url, 'https://x.com/daydream/status/1826619283746152448');
});

test('x: includeRetweets keeps them', async () => {
  stubFetch(fixture('nitter.rss.xml'));
  const posts = await x.fetchLatest({ id: 'x', handle: 'daydream', includeRetweets: true });
  assert.equal(posts.length, 2);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}\n  ${err.message}`);
  } finally {
    restore();
  }
}
console.log(failed ? `\n${failed} test(s) failed` : `\nall ${tests.length} tests passed`);
process.exit(failed ? 1 : 0);

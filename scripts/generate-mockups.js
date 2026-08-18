/**
 * Builds every message payload the bot can send, from the real render code,
 * and writes them to mockups/payloads/*.json. Run it after changing an embed
 * so the mockups in docs never drift from what the bot actually posts.
 *
 *   node scripts/generate-mockups.js
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildWelcome, buildWelcomeDm, buildGoodbye } from '../src/features/welcome/render.js';
import { renderAll } from '../src/features/notifications/render.js';
import { config } from '../src/lib/config.js';

const OUT = resolve(process.cwd(), 'mockups', 'payloads');
mkdirSync(OUT, { recursive: true });

const avatar = 'https://cdn.discordapp.com/embed/avatars/4.png';
const member = {
  id: '284620194716532736',
  displayName: 'lunaaa',
  user: {
    id: '284620194716532736',
    tag: 'lunaaa',
    username: 'lunaaa',
    createdAt: new Date('2021-03-14T09:12:00Z'),
    displayAvatarURL: () => avatar,
  },
  guild: {
    name: 'Daydream HQ',
    memberCount: 12_483,
    iconURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png',
  },
};

const accounts = Object.fromEntries(
  (config.notifications?.accounts ?? []).map((a) => [a.platform, a])
);
const withRole = (platform, extra = {}) => ({
  ...accounts[platform],
  mentionRoleId: '1140000000000000001',
  ...extra,
});

const posts = {
  youtube: {
    id: 'yt:dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'i tried every viral food hack for 7 days',
    description: 'day 4 nearly ended me. full breakdown, receipts and the one hack that actually works.',
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    author: 'Daydream',
    authorUrl: 'https://www.youtube.com/@daydream',
    publishedAt: new Date('2026-08-18T17:02:00Z'),
    kind: 'video',
    stats: { duration: '14:22', views: 18_400 },
  },
  tiktok: {
    id: 'tt:7391827364512',
    url: 'https://www.tiktok.com/@daydream/video/7391827364512',
    title: 'no because why did this actually work 😭 #fyp',
    description: 'no because why did this actually work 😭 #fyp #dayinmylife',
    thumbnail: 'https://p16-sign.tiktokcdn.com/obj/mockthumb.jpeg',
    author: '@daydream',
    authorUrl: 'https://www.tiktok.com/@daydream',
    publishedAt: new Date('2026-08-18T15:40:00Z'),
    kind: 'video',
    stats: {},
  },
  x: {
    id: 'x:1826619283746152448',
    url: 'https://x.com/daydream/status/1826619283746152448',
    title: 'new video is live. it took 3 weeks and one minor breakdown 🫠',
    description: 'new video is live. it took 3 weeks and one minor breakdown 🫠',
    thumbnail: null,
    author: 'Daydream (@daydream)',
    authorUrl: 'https://x.com/daydream',
    avatar,
    publishedAt: new Date('2026-08-18T17:06:00Z'),
    kind: 'post',
    stats: { likes: 2_310, reposts: 188 },
  },
  twitch: {
    id: 'tw:49281736451',
    url: 'https://twitch.tv/daydream',
    title: 'editing the new vid with you all + chill',
    description: 'Playing **Just Chatting**',
    thumbnail: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_daydream-1280x720.jpg',
    author: 'daydream',
    authorUrl: 'https://twitch.tv/daydream',
    publishedAt: new Date('2026-08-18T19:00:00Z'),
    kind: 'live',
    stats: { viewers: 1_042, game: 'Just Chatting' },
  },
  instagram: {
    id: 'ig:C9xKqLmNoPq',
    url: 'https://instagram.com/p/C9xKqLmNoPq',
    title: 'photo dump from the shoot 💜',
    description: 'photo dump from the shoot 💜 swipe for the outtakes',
    thumbnail: 'https://instagram.fixed.cdn/mockphoto.jpg',
    author: '@daydream',
    authorUrl: 'https://instagram.com/daydream',
    publishedAt: new Date('2026-08-17T12:15:00Z'),
    kind: 'post',
    stats: {},
  },
};

/** discord.js builders serialize through toJSON — this is the literal wire payload. */
const serialize = (payload) =>
  JSON.parse(
    JSON.stringify(payload, (_k, v) => (v && typeof v.toJSON === 'function' ? v.toJSON() : v))
  );

const files = {
  'welcome-channel.json': buildWelcome(member),
  'welcome-dm.json': buildWelcomeDm(member),
  'goodbye.json': buildGoodbye(member),
  'upload-youtube.json': renderAll(withRole('youtube'), posts.youtube),
  'upload-tiktok.json': renderAll(withRole('tiktok'), posts.tiktok),
  'upload-x.json': renderAll(withRole('x'), posts.x),
  'upload-twitch.json': renderAll(withRole('twitch'), posts.twitch),
  'upload-instagram.json': renderAll(withRole('instagram'), posts.instagram),
};

for (const [name, payload] of Object.entries(files)) {
  const json = serialize(payload);
  writeFileSync(resolve(OUT, name), `${JSON.stringify(json, null, 2)}\n`);
  const color = json.embeds?.[0]?.color;
  console.log(
    `✓ ${name.padEnd(24)} ${color != null ? `#${color.toString(16).toUpperCase().padStart(6, '0')}` : '(no embed)'}`
  );
}
console.log(`\nwrote ${Object.keys(files).length} payloads to mockups/payloads/`);

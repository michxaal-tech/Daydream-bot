import youtube from './youtube.js';
import tiktok from './tiktok.js';
import x from './x.js';
import instagram from './instagram.js';
import twitch from './twitch.js';
import kick from './kick.js';

export const platforms = { youtube, tiktok, x, instagram, twitch, kick };
export const platformIds = Object.keys(platforms);

export function getPlatform(id) {
  const p = platforms[String(id).toLowerCase()];
  if (!p) throw new Error(`Unknown platform "${id}". Known: ${platformIds.join(', ')}`);
  return p;
}

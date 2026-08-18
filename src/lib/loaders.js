import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

async function importAll(dirName) {
  const dir = join(here, '..', dirName);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js');
  const mods = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    if (mod.default) mods.push(mod.default);
  }
  return mods;
}

export async function loadCommands() {
  return importAll('commands');
}

export async function loadEvents() {
  return importAll('events');
}

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import 'dotenv/config';

const CONFIG_PATH = resolve(process.cwd(), 'config.json');

if (!existsSync(CONFIG_PATH)) {
  throw new Error('config.json not found — copy the one in the repo root and fill in your IDs.');
}

export const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

export const env = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  pollSeconds: Number(process.env.POLL_INTERVAL_SECONDS ?? 300),
  seedOnFirstRun: (process.env.SEED_ON_FIRST_RUN ?? 'true') !== 'false',
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  xBearer: process.env.X_BEARER_TOKEN || '',
  nitterBase: (process.env.NITTER_BASE_URL || 'https://nitter.net').replace(/\/$/, ''),
  rsshubBase: (process.env.RSSHUB_BASE_URL || 'https://rsshub.app').replace(/\/$/, ''),
  twitchClientId: process.env.TWITCH_CLIENT_ID || '',
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  /** Register slash commands on boot, so hosts with no terminal still work. */
  autoDeployCommands: (process.env.AUTO_DEPLOY_COMMANDS ?? 'true') !== 'false',
  /** Where the "already announced" store lives — point this at a mounted volume. */
  dataDir: process.env.DATA_DIR || 'data',
};

const NAMES = { token: 'DISCORD_TOKEN', clientId: 'DISCORD_CLIENT_ID' };

/** Fails fast with a readable message instead of a cryptic login error. */
export function assertEnv() {
  const missing = Object.keys(NAMES).filter((k) => !env[k]);
  if (!missing.length) return;

  // Hosted or local? The fix is in a completely different place, so say which.
  const hosted = Boolean(
    process.env.RAILWAY_ENVIRONMENT_NAME ||
      process.env.RENDER ||
      process.env.FLY_APP_NAME ||
      process.env.REPL_ID ||
      process.env.DYNO ||
      process.env.KUBERNETES_SERVICE_HOST
  );

  throw new Error(
    `Missing required env vars: ${missing.map((m) => NAMES[m]).join(', ')}.\n` +
      (hosted
        ? '  Set them on the service itself (Railway: your service → Variables → Raw Editor),\n' +
          '  then redeploy — variables added after a build started do not reach the running\n' +
          '  container. Project-level shared variables must be referenced by the service to apply.'
        : '  Copy .env.example to .env and fill it in.')
  );
}

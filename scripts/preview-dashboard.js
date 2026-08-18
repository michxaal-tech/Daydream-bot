/**
 * Serves the dashboard with stubbed API responses, so you can work on the UI
 * without a bot token, a Discord login, or a deploy.
 *
 *   node scripts/preview-dashboard.js  →  http://localhost:4321
 */
import express from 'express';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const app = express();
app.use(express.json());

const settings = JSON.parse(readFileSync(resolve('config.json'), 'utf8'));
settings.welcome.channelId = '1';
settings.welcome.rulesChannelId = '2';
settings.welcome.introsChannelId = '3';
settings.notifications.defaultChannelId = '4';
settings.notifications.accounts = settings.notifications.accounts.map((a, i) => ({
  ...a,
  mentionRoleId: i % 2 ? '' : '20',
  postToChannelId: String((i % 4) + 1),
}));

app.get('/api/me', (_req, res) => res.json({ signedIn: true, user: { id: '1', tag: 'you' } }));

app.get('/api/state', (_req, res) =>
  res.json({
    settings,
    overrides: [],
    platforms: ['youtube', 'tiktok', 'x', 'instagram', 'twitch', 'kick'],
    guild: {
      name: 'Daydream HQ',
      icon: null,
      memberCount: 12483,
      channels: [
        { id: '1', name: 'welcome' }, { id: '2', name: 'rules' }, { id: '3', name: 'intros' },
        { id: '4', name: 'uploads' }, { id: '5', name: 'shorts' }, { id: '6', name: 'live-now' },
        { id: '7', name: 'general' },
      ],
      roles: [
        { id: '20', name: 'YouTube Notifs', position: 5 },
        { id: '21', name: 'TikTok Notifs', position: 4 },
        { id: '22', name: 'Live Notifs', position: 3 },
        { id: '23', name: 'Member', position: 1 },
      ],
    },
    status: { uptimeMs: 7_200_000, ping: 42, watching: 3 },
  })
);

app.post('/api/settings', (req, res) => res.json({ ok: true, settings: req.body.patch }));
app.post('/api/action/:name', (req, res) =>
  res.json({ ok: true, message: `Pretended to run "${req.params.name}".` })
);
app.post('/logout', (_req, res) => res.json({ ok: true }));

app.use(express.static(resolve('src/web/public')));
app.listen(4321, () => console.log('dashboard preview → http://localhost:4321'));

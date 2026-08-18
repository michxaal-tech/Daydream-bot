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
        { id: '7', name: 'general' }, { id: '8', name: 'polls' },
      ],
      roles: [
        { id: '20', name: 'YouTube Notifs', position: 5 },
        { id: '21', name: 'TikTok Notifs', position: 4 },
        { id: '22', name: 'Live Notifs', position: 3 },
        { id: '23', name: 'Member', position: 1 },
      ],
    },
    polls,
    pollLimits: { question: 300, answer: 55, answers: 10, minHours: 1, maxHours: 768 },
    status: { uptimeMs: 7_200_000, ping: 42, watching: 3 },
  })
);

let polls = [
  { messageId: '900001', channelId: '8', question: 'What should I film next?', authorId: '1', endsAt: Date.now() + 46_800_000 },
  { messageId: '900002', channelId: '7', question: 'New intro music?', authorId: '1', endsAt: Date.now() + 3_600_000 },
];

app.post('/api/settings', (req, res) => res.json({ ok: true, settings: req.body.patch }));
app.post('/api/action/:name', (req, res) => {
  const { name } = req.params;
  if (name === 'poll-create') {
    const question = String(req.body?.question ?? '').trim();
    if (!question) return res.status(400).json({ error: 'Give the poll a question.' });
    polls = [
      { messageId: String(Date.now()), channelId: req.body.channelId ?? '8', question,
        authorId: '1', endsAt: Date.now() + (Number(req.body.hours) || 24) * 3_600_000 },
      ...polls,
    ];
    return res.json({ ok: true, message: 'Poll posted (preview).' });
  }
  if (name === 'poll-end') {
    polls = polls.filter((p) => p.messageId !== req.body?.messageId);
    return res.json({ ok: true, message: 'Poll closed (preview).' });
  }
  res.json({ ok: true, message: `Pretended to run "${name}".` });
});
app.post('/logout', (_req, res) => res.json({ ok: true }));

app.use(express.static(resolve('src/web/public')));
const port = Number(process.env.PREVIEW_PORT ?? 4321);
app.listen(port, () => console.log(`dashboard preview → http://localhost:${port}`));

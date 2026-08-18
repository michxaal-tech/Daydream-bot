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
settings.levels.enabled = true;
settings.levels.rewards = { 5: '23', 10: '20' };
settings.automod.enabled = true;
settings.moderation.modLogChannelId = '7';
settings.starboard = { enabled: true, channelId: '7', emoji: '⭐', threshold: 3 };
settings.roleMenus.panels = [
  { id: 'notifs', title: 'Notification roles', description: 'Tap to hear about drops.', exclusive: false,
    roles: [
      { roleId: '20', label: 'YouTube', emoji: '📺', description: 'new uploads' },
      { roleId: '21', label: 'TikTok', emoji: '🎵', description: 'new posts' },
      { roleId: '22', label: 'Live', emoji: '🔴', description: 'streams' },
    ] },
];
settings.economy = { enabled: true, currency: '🪙', dailyAmount: 100, streakBonus: 25, maxStreakBonusDays: 7,
  shop: [{ id: 'vip', name: 'VIP colour', price: 500, roleId: '23' }] };
settings.birthdays = { enabled: true, channelId: '7', roleId: '23', template: "It's {users}' birthday today." };
settings.afk = { enabled: true };
settings.stickyRoles = { enabled: true };
settings.suggestions = { enabled: true, channelId: '7' };
settings.confessions = { enabled: false, channelId: '', logChannelId: '' };
settings.counting = { enabled: true, channelId: '7', noDoubles: true };
settings.tempVoice = { enabled: false, lobbyChannelId: '', nameTemplate: "{user}'s room" };
settings.logging = { enabled: true, messageLogChannelId: '7', memberLogChannelId: '7',
  logDeletes: true, logEdits: true, logJoins: true, logLeaves: true, trackInvites: true };
settings.counterChannels = [{ channelId: '6', type: 'members', template: '{value} members' }];
settings.channelRules = [{ channelId: '4', autoThread: true, autoPublish: true, autoSlowmode: false, autoReact: ['💜'], sticky: '' }];
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
    giveaways,
    leaderboard: [
      { userId: '1', name: 'lunaaa', level: 24, xp: 41_200, messages: 3120 },
      { userId: '2', name: 'notch', level: 19, xp: 26_800, messages: 2011 },
      { userId: '3', name: 'mike', level: 11, xp: 9_400, messages: 870 },
    ],
    cases: [
      { id: 14, action: 'warn', userId: '4', userTag: 'spammer', moderatorTag: 'mike', reason: 'posted an invite', at: Date.now() - 3_600_000 },
      { id: 13, action: 'timeout', userId: '5', userTag: 'shouty', moderatorTag: 'automod', reason: 'wrote mostly in capitals', at: Date.now() - 7_200_000 },
    ],
    pollLimits: { question: 300, answer: 55, answers: 10, minHours: 1, maxHours: 768 },
    status: { uptimeMs: 7_200_000, ping: 42, watching: 3 },
  })
);

let polls = [
  { messageId: '900001', channelId: '8', question: 'What should I film next?', authorId: '1', endsAt: Date.now() + 46_800_000 },
  { messageId: '900002', channelId: '7', question: 'New intro music?', authorId: '1', endsAt: Date.now() + 3_600_000 },
];

let giveaways = [
  { messageId: '800001', channelId: '8', prize: 'Signed poster', entrants: ['1', '2', '3'], winnerCount: 1, endsAt: Date.now() + 7_200_000, ended: false },
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
  if (name === 'giveaway-create') {
    giveaways = [{ messageId: String(Date.now()), channelId: req.body.channelId ?? '8',
      prize: req.body.prize, entrants: [], winnerCount: Number(req.body.winners) || 1,
      endsAt: Date.now() + (Number(req.body.minutes) || 60) * 60_000, ended: false }, ...giveaways];
    return res.json({ ok: true, message: 'Giveaway posted (preview).' });
  }
  if (name === 'giveaway-end' || name === 'giveaway-cancel') {
    giveaways = giveaways.filter((g) => g.messageId !== req.body?.messageId);
    return res.json({ ok: true, message: 'Done (preview).' });
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

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
settings.brand.cardStyle = 'aurora';
settings.brand.cardIntensity = 'medium';
settings.verification = { enabled: false, roleId: '23', challenge: true };
settings.tickets = { enabled: false, staffRoleId: '20', logChannelId: '7', maxOpenPerMember: 1 };
settings.dailyPrompt = { enabled: false, channelId: '7', hourUtc: 9, openThread: true, prompts: [] };
settings.triggers = { enabled: false, cooldownSeconds: 30, list: [{ match: 'daydream', reply: 'someone say daydream?' }] };
settings.keywordAlerts = { enabled: false, notifyUserId: '', words: ['daydream'] };
settings.nicknames = { dehoist: false, fallback: 'member' };
settings.boosts = { enabled: false, channelId: '7', roleId: '23' };
settings.analytics = { enabled: true, attributionWindowHours: 24 };
settings.firstHour = { enabled: true, roleId: '23', windowMinutes: 60, announce: false, resetEachUpload: true };
settings.liveTakeover = { enabled: false, renameChannelId: '6', liveName: '🔴-live-now', bannerChannelId: '7' };
settings.recap = { enabled: true, channelId: '7', weekday: 0 };
settings.shoutouts = { enabled: true, perPersonLimit: 1 };
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
    insights: {
      messagesPerHour: Array.from({ length: 24 }, (_, i) => ({ label: String(i), value: Math.round(20 + 45 * Math.sin(i / 3.4) ** 2) })),
      joinsPerDay: Array.from({ length: 30 }, (_, i) => ({ label: `d${i}`, value: Math.max(0, Math.round(6 + 9 * Math.sin(i / 4))) })),
      grid: Array.from({ length: 7 }, (_, day) =>
        Array.from({ length: 24 }, (_, hour) => Math.round(Math.max(0, 60 * Math.sin((hour - 4) / 4) * (day > 4 ? 1.4 : 1))))),
      bestSlots: [
        { day: 5, hour: 20, value: 812, label: 'Friday 20:00 UTC' },
        { day: 6, hour: 21, value: 703, label: 'Saturday 21:00 UTC' },
        { day: 2, hour: 19, value: 466, label: 'Tuesday 19:00 UTC' },
      ],
      attribution: [
        { title: 'i tried every viral food hack for 7 days', url: '#', joins: 42, at: Date.now() - 86_400_000, topInvite: 'abc123' },
        { title: 'reading your worst comments', url: '#', joins: 11, at: Date.now() - 5 * 86_400_000, topInvite: 'abc123' },
        { title: 'q&a while I edit', url: '#', joins: 6, at: Date.now() - 9 * 86_400_000, topInvite: null },
      ],
      invites: [{ code: 'abc123', inviterTag: 'mike', joins: 51 }, { code: 'tiktok-bio', inviterTag: null, joins: 23 }],
      superfans: [
        { userId: '1', name: 'lunaaa', score: 148, firstHour: 12, stars: 21, giveaways: 4, xp: 41200 },
        { userId: '2', name: 'notch', score: 96, firstHour: 7, stars: 9, giveaways: 3, xp: 26800 },
        { userId: '3', name: 'mike', score: 41, firstHour: 2, stars: 6, giveaways: 1, xp: 9400 },
      ],
      recentJoins: [
        { userId: '9', name: 'newbie', inviteCode: 'abc123', at: Date.now() - 400_000 },
        { userId: '8', name: 'someone', inviteCode: 'tiktok-bio', at: Date.now() - 3_600_000 },
      ],
      recentUploads: [{ title: 'i tried every viral food hack for 7 days', at: Date.now() - 86_400_000 }],
    },
    shoutouts: [
      { id: 3, userId: '1', userTag: 'lunaaa', text: 'shout out my cat, she is 14 today', at: Date.now() - 900_000, upvotes: ['a', 'b'] },
      { id: 4, userId: '2', userTag: 'notch', text: 'please say hi to my brother, he is a big fan', at: Date.now() - 3_000_000, upvotes: [] },
    ],
    abtests: [{ id: 1, question: 'which thumbnail?', labelA: 'red arrow', labelB: 'no arrow', votes: { a: ['1', '2', '3'], b: ['4'] } }],
    health: {
      passed: 6, total: 9,
      checks: [
        { ok: true, label: 'Server Members intent', fix: '' },
        { ok: false, label: 'Message Content intent', fix: "Automod's text rules and the counting game stay inactive without it." },
        { ok: true, label: 'Welcome channel set', fix: '' },
        { ok: true, label: 'At least one account watched', fix: '' },
        { ok: true, label: 'Uploads channel set', fix: '' },
        { ok: false, label: 'Mod-log channel set', fix: 'Automod is on but nothing records what it does.' },
        { ok: true, label: 'A role panel exists', fix: '' },
        { ok: false, label: 'Settings persist across deploys', fix: 'DATA_DIR should point at a mounted volume.' },
        { ok: true, label: 'My role outranks what I hand out', fix: '' },
      ],
    },
    scheduled: [
      { id: '1', channelId: '4', text: 'new video goes up in an hour 👀', repeat: 'once', at: Date.now() + 3_600_000 },
      { id: '2', channelId: '7', text: 'weekly check-in — what are you working on?', repeat: 'weekly', at: Date.now() + 86_400_000 },
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
  if (['verify-panel','ticket-panel','schedule-add','schedule-remove'].includes(name)) return res.json({ ok: true, message: 'Done (preview).' });
  if (name === 'recap-preview') return res.json({ ok: true, message: 'Sent you the recap as a DM (preview).' });
  if (name === 'validate-feed') {
    return res.json({ ok: true, message: '✓ Daydream — latest: "i tried every viral food hack for 7 days"' });
  }
  if (name === 'shoutout-done' || name === 'abtest-close') {
    return res.json({ ok: true, message: 'Done (preview).' });
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

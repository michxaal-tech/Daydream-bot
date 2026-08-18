# Feature menu — influencer community bot

Everything below is scoped to a creator server (TikTok / YouTube / X). Each item
is written so you can hand it straight to a dev as a ticket.

**Legend** — 🟢 shipped in this repo · 🟡 next up · ⚪ backlog · 💰 monetisation

---

## 1. Arrivals, onboarding & retention

| | Feature | What it does |
|---|---|---|
| 🟢 | **Welcome ping** | Pings the new member by name in `#welcome` with a lavender embed, member count, account age and social buttons |
| 🟢 | **Rotating greetings** | Pool of greeting lines, picked deterministically per user so it never feels copy-pasted |
| 🟢 | **Welcome DM** | Private "start here" DM with the 3 things to do first; silently skipped if DMs are closed |
| 🟢 | **Auto-role on join** | Drops a `@Member` (or `@Unverified`) role automatically |
| 🟢 | **Auto-reactions** | Bot reacts 💜 👋 so the welcome post already has social proof |
| 🟢 | **Goodbye line** | Low-key leave message, no ping |
| 🟢 | **Verification gate** | Button plus an optional two-number challenge, granting a role |
| 🟡 | **Rules accept button** | "I agree" button grants access; logs who accepted and when |
| 🟡 | **Onboarding quiz** | 3-question modal (where'd you find me / favourite video / timezone) → auto-assigns roles from answers |
| ⚪ | **Invite attribution** | Tracks which invite link each member used — see which video/collab actually drives joins |
| ⚪ | **Join-source leaderboard** | Ranks members by how many people they invited |
| ⚪ | **Welcome card image** | Renders a PNG banner with the member's avatar (canvas/satori) instead of a plain embed |
| ⚪ | **Return greeting** | Different message for members who left and came back |
| ⚪ | **Milestone member** | Special embed + role when member #10,000 joins |
| ⚪ | **Inactivity nudge** | DM after 30 days of silence with "here's what you missed" |
| ⚪ | **Exit survey** | Optional one-click DM poll when someone leaves |

## 2. Upload & live notifications

| | Feature | What it does |
|---|---|---|
| 🟢 | **YouTube uploads** | Public RSS feed per channel — no API key, no quota |
| 🟢 | **TikTok posts** | Via RSSHub / bridge feed, swappable per account |
| 🟢 | **X / Twitter posts** | Official API v2 when a bearer token exists, Nitter RSS fallback when it doesn't |
| 🟢 | **Twitch live** | Helix poll; one announcement per stream session |
| 🟢 | **Instagram posts** | Bridge feed, reels detected separately |
| 🟢 | **Kick live** | Public channel endpoint |
| 🟢 | **Webhook or bot posting** | Per-account: post as the bot, or through a webhook with its own name/avatar |
| 🟢 | **Role pings per platform** | `@YouTube Notifs` vs `@Live Notifs` — people opt into only what they want |
| 🟢 | **First-run seeding** | Never dumps your last 15 uploads into chat when you first boot the bot |
| 🟢 | **Custom templates** | `{roleMention} {author} {title} {url} {platform}` placeholders per account |
| 🟢 | **Auto-thread** | Opens a discussion thread under each upload post |
| 🟢 | **Crosspost** | Publishes to an announcement channel so other servers following get it |
| 🟡 | **YouTube PubSubHubbub** | Push instead of poll — announcements land in ~5 seconds instead of ~5 minutes |
| 🟡 | **Premiere & scheduled-stream alerts** | "Premiere in 30 min" countdown, then "it's live" |
| 🟡 | **Shorts vs long-form split** | Route Shorts to `#shorts`, long-form to `#uploads` |
| 🟡 | **Live-now voice/channel rename** | Renames a channel to `🔴-live-now` and reverts when the stream ends |
| ⚪ | **Cross-post digest** | One "this week's drops" embed on Sundays instead of five separate pings |
| ⚪ | **Community-post alerts** | YouTube community tab / X Spaces |
| ⚪ | **Collab detection** | If a guest handle appears in a title, ping their role too |
| ⚪ | **Milestone tracker** | Auto-announces 100K subs, 1M views on a video, etc. |
| ⚪ | **Auto-pin latest** | Keeps only the newest upload pinned in `#uploads` |
| ⚪ | **Failed-fetch alerting** | DMs an admin if a feed 404s for 3 checks in a row |

## 3. Engagement loops (the part that keeps a server alive)

| | Feature | What it does |
|---|---|---|
| 🟢 | **XP & levels** | Message XP with a cooldown, level-up embeds, role rewards at any level |
| 🟢 | **Leaderboard** | `/leaderboard` and `/rank`, plus the top ten on the dashboard |
| 🟡 | **Daily streaks** | Check in once a day, keep a streak, earn currency |
| 🟡 | **Server currency** | Earn coins from activity; spend them in the shop |
| ⚪ | **Shop & inventory** | Custom colour roles, name colours, one-day VIP, shoutout raffles |
| ⚪ | **First-comment race** | Points for the first 10 people to react to an upload post |
| ⚪ | **Watch-party scheduler** | Countdown + auto-VC creation for premieres |
| 🟢 | **Giveaways** | Button entry, role-gating, auto-draw on a timer, reroll and cancel |
| 🟢 | **Polls** | `/poll create` — Discord's native poll: radio buttons, Vote button, hidden results until close, multi-select, 1h–2w duration |
| ⚪ | **Q&A / AMA queue** | Members submit questions, mods upvote, the creator gets a ranked list |
| ⚪ | **Fan-art gallery** | Post in `#fan-art` → auto-thread, auto-crosspost the best to a showcase channel |
| ⚪ | **Clip-of-the-week** | Members submit clips, react-vote, winner gets a role |
| ⚪ | **Birthday board** | Opt-in birthdays, morning shoutout, temporary 🎂 role |
| ⚪ | **Confession/anon box** | Modal → anonymised post in a moderated channel |
| ⚪ | **Counting / word games** | Cheap always-on activity channels |
| 🟢 | **Reminders** | `/remindme` with natural durations, surviving restarts |

## 4. Roles & self-service

| | Feature | What it does |
|---|---|---|
| 🟢 | **Button role menus** | Multiple panels, optional exclusive mode, built from Discord or the dashboard |
| 🟢 | **Notification role picker** | A role panel mapping 1:1 to the watched platforms |
| ⚪ | **Level-gated channels** | `#deep-chat` unlocks at level 10 — kills drive-by spam |
| ⚪ | **Booster perks** | Auto custom-colour role, private lounge, boost thank-you post |
| ⚪ | **Temporary roles** | Event roles that expire automatically |
| ⚪ | **Colour-role picker** | Members choose a name colour from a lavender-family palette |

## 5. Moderation & safety

| | Feature | What it does |
|---|---|---|
| 🟢 | **Automod rules** | Invites, links, mass mentions, shouting, repeats and a word list |
| 🟢 | **Lockdown** | `/server lockdown` stops everyone posting server-wide, and logs itself as a case |
| 🟢 | **New-account gate** | Accounts under X days are quarantined or bounced before the welcome fires |
| 🟢 | **Warn / timeout / kick / ban** | Numbered cases, DM notice, mod-log embed, rank checks |
| 🟢 | **Strike escalation** | Configurable warn → timeout → kick ladder, counted across cases |
| ⚪ | **Scam-link scanner** | Checks URLs against a phishing list before they render |
| ⚪ | **Impersonation watch** | Flags new members whose name/avatar mimics the creator or a mod |
| 🟢 | **Slowmode autopilot** | Raises and lifts itself with hysteresis, per channel |
| ⚪ | **Ticket system** | Private support/business-enquiry threads with transcripts |
| ⚪ | **Report button** | Right-click a message → report to mods |
| 🟡 | **Mod-log everything** | Actions are logged today; edits, deletes and role changes are not yet |
| ⚪ | **Appeal flow** | Banned users get a DM link to an appeal form |
| ⚪ | **NSFW image filter** | Vision check on attachments in SFW channels |
| ⚪ | **Age-gate for merch/18+ channels** | Verification role required |

## 6. Creator tooling (the private side of the server)

| | Feature | What it does |
|---|---|---|
| ⚪ | **Analytics digest** | Weekly DM: joins, retention, top channels, which upload drove the most joins |
| ⚪ | **Title/thumbnail A/B poll** | Drop two thumbnails in `#inner-circle`, get a vote split |
| ⚪ | **Idea box** | Members pitch video ideas, upvote, exportable to CSV |
| ⚪ | **Sponsor/brand enquiry ticket** | Routed to a private channel with a structured modal |
| ⚪ | **Content calendar** | `/schedule` posts upcoming drops into an embed that self-updates |
| ⚪ | **Comment-highlight relay** | Pulls top YouTube comments into a channel for the creator to reply |
| ⚪ | **Sub-count ticker** | Voice channel named `📊 1.2M subs`, updated hourly |
| ⚪ | **Merch drop alerts** | Shopify webhook → embed with stock and a buy button |
| 💰 | **Member-only tiers** | Patreon/YouTube-membership/Twitch-sub role sync |
| 💰 | **Paid perks** | Early-access channels, monthly VC hangouts gated by tier role |

## 7. Fun & personality

| | Feature | What it does |
|---|---|---|
| 🟢 | **`/socials`** | One embed with every link + buttons |
| 🟢 | **`/latest`** | Pulls the newest post from any platform on demand |
| ⚪ | **Catchphrase triggers** | Bot replies with an in-joke when someone says the phrase |
| ⚪ | **Soundboard / VC clips** | Plays signature audio clips in voice |
| ⚪ | **Meme generator** | `/meme` with the creator's face templates |
| ⚪ | **Quote board** | React ⭐ to immortalise a message in `#hall-of-fame` |
| 🟢 | **Starboard** | Threshold-based, edits itself as the count changes, removes itself if it drops |
| ⚪ | **8ball / roasts / compliments** | Cheap dopamine, keeps `#general` warm |
| ⚪ | **AI chat character** | The bot answers in the creator's voice in one dedicated channel |
| ⚪ | **Daily prompt** | "What are you working on today?" posted every morning |

## 8. Platform & ops

| | Feature | What it does |
|---|---|---|
| 🟢 | **JSON config** | Everything tunable without touching code |
| 🟢 | **Slash commands with autocomplete** | `/notify test account:` autocompletes configured accounts |
| 🟢 | **Graceful shutdown** | Clean SIGINT/SIGTERM, no duplicate pollers |
| 🟢 | **`/setup` commands** | Channels, toggles, greetings, watched accounts, links and accent — all from inside Discord |
| 🟢 | **Settings that survive redeploys** | Runtime changes merge over config.json in a mounted volume |
| 🟡 | **Per-guild config in a DB** | SQLite/Postgres so the bot can serve multiple creators |
| 🟢 | **Web dashboard** | Discord OAuth login, Manage-Server gated, live previews of the welcome message and of polls before posting |
| ⚪ | **Health endpoint + uptime pings** | `/healthz` for Railway/Fly health checks |
| ⚪ | **Sharding** | Needed past ~2,500 guilds |
| ⚪ | **Rate-limit-aware queue** | Batches announcements when five platforms fire at once |
| ⚪ | **Backup/export** | Nightly config + level data dump |
| ⚪ | **Audit trail for config changes** | Who changed which setting, when |

---

## Suggested build order

1. **Done** — welcome, upload notifications, polls, role menus, levels, automod
   and moderation, giveaways, starboard, reminders, and a dashboard covering all of it.
2. **Next** — membership tier sync (Patreon / YouTube members / Twitch subs),
   watch parties with countdowns, and a public stats page.
3. **Later** — an AI persona channel, comment-highlight relay, merch drop alerts.

## Channel layout this assumes

```
📌 START HERE          #welcome  #rules  #announcements  #roles
📺 DROPS               #uploads  #shorts  #live-now  #x-posts
💬 COMMUNITY           #general  #intros  #fan-art  #clips  #off-topic
🎁 EVENTS              #giveaways  #polls  #watch-party
🔒 STAFF               #mod-log  #tickets  #bot-config
```

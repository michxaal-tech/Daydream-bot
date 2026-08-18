# Setup guide

Roughly 15 minutes end to end.

## 1. Create the application

1. https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → **Reset Token** → copy it into `.env` as `DISCORD_TOKEN`.
   Treat it like a password; anyone with it controls the bot.
3. Same tab → **Privileged Gateway Intents** → turn on **Server Members
   Intent**. Without it `guildMemberAdd` never fires and no welcome is sent.
4. **General Information** → copy **Application ID** into `DISCORD_CLIENT_ID`.

## 2. Invite it

OAuth2 → URL Generator → scopes `bot` + `applications.commands`, permissions:

| Permission | Needed for |
|---|---|
| View Channels, Send Messages, Embed Links, Attach Files | everything |
| Add Reactions | welcome 💜 reactions |
| Manage Roles | auto-role on join (bot's role must sit **above** the roles it grants) |
| Create Public Threads, Send Messages in Threads | auto-thread on uploads |
| Manage Webhooks | if you want the bot to create webhooks itself |
| Mention @everyone, @here, All Roles | only if an account sets `mentionEveryone` |

## 3. Get the IDs

Discord → Settings → Advanced → **Developer Mode** on. Then right-click →
Copy ID on any channel, role or user.

Fill in `config.json`:

```jsonc
{
  "welcome": {
    "channelId": "123...",       // #welcome
    "rulesChannelId": "123...",
    "introsChannelId": "123...",
    "rolesChannelId": "123...",
    "autoRoleIds": ["123..."]    // e.g. @Member
  },
  "notifications": {
    "defaultChannelId": "123..." // #uploads
  }
}
```

## 4. Platform credentials

### YouTube (no key needed)
You need the **channel ID**, not the `@handle`. Either:
- youtube.com/account_advanced while logged in as the channel, or
- open the channel page → view source → search `"channelId"`.

It starts with `UC`. Put it in the account's `channelId` field. Sanity-check the
feed in a browser first:
`https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxx`

Optional `YOUTUBE_API_KEY` (Google Cloud → YouTube Data API v3) adds duration,
view count, and Shorts detection. The free quota is plenty for this.

### Twitch
dev.twitch.tv/console/apps → Register Your Application → OAuth redirect
`http://localhost` → copy Client ID and generate a Client Secret.

### X / Twitter
developer.x.com → Project → Keys and tokens → **Bearer Token**. The free tier is
read-limited; if you hit the cap the bot falls back cleanly to whatever
`NITTER_BASE_URL` you configure. Public Nitter mirrors are unreliable — expect
to self-host or to pay for the API if X notifications matter to you.

### TikTok / Instagram
No free public feed exists. Options, best first:

1. **Self-host RSSHub** (`docker run -d -p 1200:1200 diygod/rsshub`), then set
   `RSSHUB_BASE_URL=http://localhost:1200`.
2. **Paid scraper** (Apify, EnsembleData) — set `feedUrl` on the account to the
   RSS endpoint it gives you.
3. **Manual fallback** — skip the adapter and post those yourself.

The public `rsshub.app` instance works for testing and gets rate-limited in
production. Don't build the launch on it.

## 5. Notification roles

Make a role per platform (`@YouTube Notifs`, `@TikTok Notifs`, `@Live Notifs`),
put the IDs in each account's `mentionRoleId`, and let members self-assign them
from a role menu. Pinging `@everyone` on every upload is the fastest way to get
people to mute the server — `mentionEveryone` exists but leave it `false`.

## 6. Webhooks (optional)

Channel → Edit Channel → Integrations → Webhooks → New Webhook. Name it
`Daydream Uploads`, give it your logo, copy the URL into the account's
`webhookUrl`. Now the upload posts come from a branded sender instead of the
bot. Note that webhook messages can't start threads or be crossposted — leave
`webhookUrl` empty on accounts where you want those.

## 7. Run it

```bash
npm run deploy   # register slash commands — instant with DISCORD_GUILD_ID set
npm start
```

You should see:

```
• [bot] loaded 5 command(s): latest, notify, ping, socials, welcome
• [bot] logged in as Daydream#1234 — 1 guild(s)
• [notify] watching 3 account(s) every 300s
• [notify] seeded yt-main with 15 existing post(s) — no announcement
```

That seeding line is the safety net: on first run the bot records your existing
uploads as "already seen" instead of announcing all of them. Set
`SEED_ON_FIRST_RUN=false` only if you actually want a backfill.

## 8. Verify

| Check | Command | Expect |
|---|---|---|
| Bot is alive | `/ping` | pong + latency |
| Welcome renders | `/welcome preview` | private embed, no ping |
| Welcome really posts | `/welcome test` | public post in `#welcome` that pings you |
| Feeds resolve | `/notify check` | "nothing new" (not an error) |
| Upload formatting | `/notify test account:yt-main` | your latest video, in this channel |

## Troubleshooting

| Symptom | Cause |
|---|---|
| No welcome on join, but `/welcome test` works | Server Members Intent is off |
| `Missing Permissions` on auto-role | Bot's role is below the role it's granting |
| `channel is missing or not text-based` | Wrong ID, or the bot can't see that channel |
| Slash commands don't show | Run `npm run deploy`; global registration takes ~1h, guild is instant |
| Same upload posted twice | Two instances running, or `data/store.json` isn't persisted between restarts |
| TikTok feed 404s | RSSHub instance is down or rate-limiting — self-host it |
| Ping doesn't actually notify | The mention must be in message `content`, not only in the embed |

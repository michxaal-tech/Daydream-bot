# Daydream Bot

A Discord bot for a creator community. Four things work end-to-end today:

1. **Welcome** — pings every new member by name in `#welcome`, with a lavender
   embed, member count, social buttons and an optional DM.
2. **Upload notifications** — watches YouTube, TikTok, X, Instagram, Twitch and
   Kick and posts a branded embed (as the bot or through a webhook) the moment
   something new drops.
3. **Polls** — Discord's native polls: radio buttons, a Vote button, results
   hidden until it closes. Multi-select and any duration from 1 hour to 2 weeks.
4. **A dashboard** — sign in with Discord and run everything from a browser:
   configure the bot, post and end polls, with live previews of both. Nothing
   needs editing by hand.

Everything the bot sends uses one lavender accent bar (`#A78BFA`) on the left of
the embed, so the server reads as one brand instead of a rainbow of vendor reds.
Live alerts step up to a deeper violet (`#7C5CFF`).

- 📋 [Feature menu / roadmap](docs/FEATURES.md) — ~120 features, ordered by what to build next
- 🎨 [Message mockups](docs/MOCKUPS.md) — what every reply and webhook looks like
- 🛠️ [Setup guide](docs/SETUP.md) — from zero to a bot in your server
- 📱 [Setup from an iPad](docs/SETUP-IPAD.md) — browser-only, no terminal anywhere
- 🎛️ [The dashboard](docs/DASHBOARD.md) — turning on the web UI and who can access it

---

## Quick start

```bash
git clone https://github.com/michxaal-tech/Daydream-bot
cd Daydream-bot
npm install

cp .env.example .env       # paste your bot token + client id
$EDITOR config.json        # channel ids, role ids, your handles

npm start                  # registers its own slash commands on boot
```

Then in Discord: `/welcome test` — it should ping you in `#welcome`.

## Commands

| Command | Who | What |
|---|---|---|
| `/welcome test` | Manage Server | Fires a real welcome for you, ping included |
| `/welcome preview` | Manage Server | Shows it privately, no ping, nothing posted |
| `/welcome greet <member>` | Manage Server | Manually welcome someone who slipped through |
| `/notify list` | Manage Server | Every watched account, where it posts, what it pings |
| `/notify check` | Manage Server | Polls all feeds right now |
| `/notify test <account>` | Manage Server | Re-posts the latest item to check formatting |
| `/setup channel` | Manage Server | Point a feature at a channel |
| `/setup welcome` | Manage Server | Toggles: greet, ping, DM, goodbye, auto-role |
| `/setup greeting` | Manage Server | Replace the greeting lines |
| `/setup watch` | Manage Server | Start watching an account |
| `/setup unwatch` | Manage Server | Stop watching one |
| `/setup socials` | Manage Server | Set your links |
| `/setup colour` | Manage Server | Change the accent bar |
| `/setup show` | Manage Server | The whole current config |
| `/poll create` | Everyone | Button poll with live results |
| `/poll end` \| `/poll list` | Author or Manage Messages | Close early and reveal results, or list running polls |
| `/latest <platform>` | Everyone | Newest post from a platform, on demand |
| `/socials` | Everyone | All links in one embed with buttons |
| `/ping` | Everyone | Latency + uptime |

## How the pieces fit

```
src/
  index.js                     client bootstrap, loads commands + events
  deploy-commands.js           registers slash commands
  lib/
    config.js                  config.json + .env, fails fast on missing vars
    settings.js                runtime settings merged over config.json
    brand.js                   the lavender accent bar lives here
    store.js                   json persistence: which posts are already announced
    http.js                    fetch + RSS/Atom parsing
    logger.js
  events/                      ready, guildMemberAdd, guildMemberRemove, interactionCreate
  commands/                    one file per slash command, auto-loaded
  web/
    server.js                  dashboard: Discord OAuth, settings API, actions
    session.js                 signed-cookie sessions
    public/index.html          the dashboard itself
  features/
    polls/index.js             native Discord polls — option parsing and limits
    welcome/
      render.js                builds the payload (pure — easy to unit test)
      index.js                 join/leave handling, auto-role, DM
    notifications/
      platforms/               one adapter per platform, all return the same shape
      render.js                embed + buttons + template placeholders
      watcher.js               polling loop, dedupe, webhook-or-bot posting
scripts/generate-mockups.js    dumps real payloads to mockups/payloads/
```

Adding a platform is one file in `features/notifications/platforms/` that returns
`{ id, url, title, description, thumbnail, author, publishedAt, kind, stats }`,
plus a line in `platforms/index.js`. Everything downstream is shared.

## What's real vs. what needs a key

| Platform | Source | Needs |
|---|---|---|
| YouTube | Public Atom feed per channel | Nothing. API key optional (adds duration + views) |
| Twitch | Helix API | `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` (free) |
| X | API v2, or Nitter RSS fallback | `X_BEARER_TOKEN` for the reliable path |
| Kick | Public channel endpoint | Nothing |
| TikTok | RSS bridge (RSSHub) or paid scraper | Self-hosted RSSHub, or a `feedUrl` per account |
| Instagram | Same as TikTok, or Graph API for accounts you own | Same |

TikTok and Instagram are the honest weak spots — neither has a free, stable,
public feed. The adapters take a `feedUrl` per account so you can point them at
whatever bridge you settle on without touching code.

## Configuring it

Three ways, all writing to the same place:

- **The dashboard** — `/` on the bot's own URL. Sign in with Discord, edit, save.
- **`/setup` commands** — everything the dashboard does, from inside Discord.
- **`config.json`** — the committed defaults, used when nothing overrides them.

Changes from the first two land in `<DATA_DIR>/settings.json` and are merged
over `config.json` at boot, so a redeploy never overwrites what you configured.
`config.json` stays the fallback for anything you haven't touched.

## Deploying

Any always-on Node host works (Railway, Fly.io, a VPS, a Pi). Requirements:
Node 18.17+, the env vars from `.env.example`, and a writable `data/` directory
for the "already announced" store. One instance only — two instances polling the
same feeds will double-post.

In the Discord Developer Portal, enable the **Server Members Intent** under
Bot → Privileged Gateway Intents, or `guildMemberAdd` never fires and the
welcome feature stays silent.

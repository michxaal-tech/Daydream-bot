# Setup from an iPad (no computer, no terminal)

Everything here happens in Safari and the Discord app. You never run a command.
The bot registers its own slash commands on startup, so the `npm run deploy`
step in the main guide doesn't apply to you.

Roughly 25 minutes. Do the steps in order — step 5 fails if step 2 was skipped.

---

## 1. Create the bot · Safari

Go to **discord.com/developers/applications** → **New Application** → name it.

Tap the **Bot** tab in the left menu:

| Do this | Where it goes |
|---|---|
| **Reset Token** → Copy | You'll paste this in step 4 as `DISCORD_TOKEN` |
| Scroll to **Privileged Gateway Intents** → turn on **Server Members Intent** → **Save Changes** | — |

Then **General Information** → copy the **Application ID** → that's your
`DISCORD_CLIENT_ID`.

Paste the token somewhere private for a few minutes — Apple Notes is fine,
delete it after. Never put it in a Discord message or a screenshot: anyone with
that string controls the bot. If it leaks, hit **Reset Token** and the old one
dies instantly.

> Safari tip: the developer portal is a desktop site. If a menu is cut off, tap
> **ᴀA** in the address bar → **Request Desktop Website**.

## 2. Turn on the intent — the one people skip

Bot tab → **Privileged Gateway Intents** → **Server Members Intent** → on → Save.

Without it Discord never tells your bot that someone joined, and the welcome
feature does nothing at all while looking perfectly healthy. If you only
remember one thing from this page, remember this switch.

## 3. Invite the bot · Safari

Paste your Application ID into this URL where it says `YOUR_CLIENT_ID`, then
open it and pick your server:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=310043069504&scope=bot%20applications.commands
```

Then, in the Discord app: **Server Settings → Roles** → drag the bot's role
**above** `@Member` (or whatever role it will hand out). A bot can't grant a role
that sits above its own.

## 4. Deploy it · Safari

The bot has to run somewhere 24/7. An iPad can't do that — iPadOS suspends apps
in the background, so it would go offline every time you locked the screen. Use
Railway; it deploys straight from GitHub with no terminal.

1. **railway.app** → **Login with GitHub**.
2. **New Project** → **Deploy from GitHub repo** → authorise Railway → pick
   **michxaal-tech/Daydream-bot**.
3. Open the service → **Settings** → **Source** → set **Branch** to
   `claude/influencer-discord-bot-ytjyuh`. Not `main` — the code lives on that
   branch.
4. **Variables** tab → add:

   | Name | Value |
   |---|---|
   | `DISCORD_TOKEN` | the token from step 1 |
   | `DISCORD_CLIENT_ID` | the Application ID |
   | `DISCORD_GUILD_ID` | your server's ID (step 5 explains how to copy it) |
   | `DATA_DIR` | `/app/data` |

5. **Settings** → **Volumes** → **New Volume** → mount path `/app/data`.

   Skip this and every redeploy wipes the bot's memory of what it already
   announced, so it re-posts your last uploads. One tap now, no confused
   members later.

Railway redeploys on every push to that branch. The **Deployments → View Logs**
tab is where you'll confirm it's alive in step 6.

Railway's free trial covers a few weeks; after that a bot like this runs about
$5/month. Alternatives with the same browser-only flow: Render (background
worker) or Replit.

## 5. Fill in your channel and role IDs · Discord app + Safari

**Get the IDs.** In the Discord app: **Settings → Advanced → Developer Mode**
on. Now long-press any channel, role or your server icon → **Copy ID**.

You need:

- `#welcome`, `#rules`, `#intros`, `#roles`, `#uploads` — channel IDs
- your server ID (long-press the server icon)
- the role ID for each notification role you create
  (Server Settings → Roles → long-press a role → Copy ID)

**Edit the file.** In Safari, open the repo, switch the branch selector to
`claude/influencer-discord-bot-ytjyuh`, tap `config.json`, then the **pencil**
icon. Replace the placeholder strings:

```jsonc
"welcome": {
  "channelId":       "1234567890123456789",   // #welcome
  "rulesChannelId":  "…",
  "introsChannelId": "…",
  "rolesChannelId":  "…",
  "autoRoleIds":     ["…"]                    // @Member — or [] for none
},
"notifications": {
  "defaultChannelId": "…"                     // #uploads
}
```

Then for each account under `notifications.accounts`, set `handle`,
`mentionRoleId`, and `enabled`. Set `enabled: false` on anything you're not
using yet.

Tap **Commit changes**. Railway redeploys in about a minute.

> The JSON is picky: every value in quotes, a comma between entries, none after
> the last one. If the bot won't start after an edit, that's the first thing to
> check — the logs will say `Unexpected token`.

**Start with YouTube only.** It needs no API key: get the channel ID (starts
with `UC`) from **youtube.com/account_advanced** while signed in as the channel,
and put it in the `yt-main` account's `channelId`. Prove the pipeline works with
one platform, then add the rest.

## 6. Check it's alive · Railway logs

Railway → **Deployments** → **View Logs**. You want:

```
• [bot] loaded 5 command(s): latest, notify, ping, socials, welcome
• [deploy] registered 5 command(s) to guild 123… (instant)
• [bot] logged in as Daydream#1234 — 1 guild(s)
• [notify] seeded yt-main with 15 existing post(s) — no announcement
```

That last line is the safety net: on first run the bot files your existing
uploads as already-seen instead of announcing all fifteen at once.

## 7. Test it · Discord app

Run these in order. Type `/` in any channel to see them.

| Command | What you should see |
|---|---|
| `/ping` | pong + latency — it's connected |
| `/welcome preview` | the welcome embed, privately, no ping |
| `/welcome test` | a real post in `#welcome` that pings you |
| `/notify check` | "nothing new" — feeds resolve |
| `/notify test account:yt-main` | your latest video, formatted |

If commands don't appear in the `/` list, force-quit and reopen Discord — the
app caches them.

---

## When something's wrong

| What you see | What it is |
|---|---|
| Commands missing from the `/` menu | `DISCORD_GUILD_ID` not set (global registration takes ~1h), or Discord's cache — force-quit the app |
| `/welcome test` works, real joins do nothing | Server Members Intent is off (step 2) |
| Bot shows offline | Check Railway logs. `Missing required env vars` = a variable is misspelled; `Unexpected token` = broken JSON in `config.json` |
| `Missing Permissions` in the logs | The bot's role sits below the role it's granting (step 3) |
| Same upload posted twice | No volume mounted, or `DATA_DIR` isn't `/app/data` |
| Auto-role doesn't apply | Same role-order problem as above |

## What you can't do from an iPad

Running the bot locally to test changes needs a terminal. If you want one on the
iPad, **GitHub Codespaces** (github.com → the repo → **Code** → **Codespaces**)
gives you a real browser-based editor and terminal that works in Safari, free
for 60 hours a month. That's for editing and testing — it stops when idle, so
it still isn't where the bot should live.

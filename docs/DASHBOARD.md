# The dashboard

A web UI for everything the bot does. It runs inside the bot process, so it
reads live settings, lists your real channels and roles, and can fire test
messages — no separate service, no database.

## Turning it on

Three values, then a redeploy.

**1. Get the client secret.** Developer Portal → your app → **OAuth2** →
**Client Secret** → Reset/Copy. Add it as `DISCORD_CLIENT_SECRET`.

**2. Give the bot a public URL.** On Railway: your service → **Settings** →
**Networking** → **Generate Domain**. You'll get something like
`daydream-bot-production.up.railway.app`. Railway exposes this automatically, so
`DASHBOARD_URL` fills itself in — set it manually only if you use a custom
domain. No trailing slash.

**3. Tell Discord to trust it.** Developer Portal → **OAuth2** → **Redirects** →
**Add Redirect** → paste your URL with `/callback` on the end:

```
https://daydream-bot-production.up.railway.app/callback
```

Save. This has to match exactly — a missing `/callback`, a trailing slash, or
`http` instead of `https` all produce Discord's "invalid redirect_uri" error.

**4. Optional but recommended:** set `SESSION_SECRET` to any long random string.
Without one the bot generates a throwaway secret at boot, which means every
restart signs you out.

Then open your URL and click **Sign in with Discord**.

## Who can get in

You need the **Manage Server** permission in the guild named by
`DISCORD_GUILD_ID`. The check happens server-side against Discord's own answer
about your permissions, on every login. Being in the server isn't enough, and
neither is knowing the URL — there's no page behind the login that renders
without a valid session cookie.

The session cookie is signed with `SESSION_SECRET`, `HttpOnly`, `SameSite=Lax`,
and marked `Secure` on https. State-changing requests are additionally checked
against the expected origin.

Webhook URLs are never sent to the browser — the API masks them, and a masked
value coming back means "leave it alone" rather than overwriting the real one.

## What's on it

| Tab | What you can change |
|---|---|
| **Welcome** | Welcome/rules/intros/roles channels, greeting lines, ping · DM · goodbye · auto-role toggles, and a live preview that redraws as you type |
| **Notifications** | Every watched account: handle, target channel, ping role, custom message, pause switch. Add and remove accounts, test any one of them |
| **Links** | The profile links behind `/socials` |
| **Appearance** | The accent bar — six presets or any hex — plus footer text |

Every page has a **Save changes** bar that only appears when something actually
differs from what's saved. Nothing is written until you press it.

## Where the settings live

Saving writes `<DATA_DIR>/settings.json` and merges it over the committed
`config.json` in memory, immediately — no restart, no redeploy. `config.json`
remains the default for anything you haven't overridden.

This is why the volume matters: without one, `settings.json` lives on the
container's ephemeral disk and every redeploy silently reverts you to the
committed defaults.

## If it won't start

The bot logs the reason and carries on running — the dashboard failing never
takes the bot down.

| Log line | Fix |
|---|---|
| `dashboard needs DISCORD_CLIENT_SECRET` | Add it from OAuth2 → Client Secret |
| `dashboard needs DISCORD_GUILD_ID` | Add your server id, so it knows what to authorise against |
| `DASHBOARD_URL not set — login will fail until it is` | Generate a domain, or set it manually |
| `dashboard disabled` | `DASHBOARD_ENABLED=false` is set |

And once it's up:

| What you see | What it is |
|---|---|
| Discord says "invalid redirect_uri" | The portal entry doesn't byte-for-byte match what the bot sends. The bot logs the exact string at startup — copy that. Or read it out of the address bar on Discord's error page: `redirect_uri=` in the query string, URL-decoded |
| "This login was started somewhere else" | You began at one domain and came back on another — usually after regenerating the Railway domain. Start again from the current one |
| "The login cookie went missing" | The browser dropped the state cookie. Allow cookies for the site and start again |
| "Discord refused the login" | The page names Discord's own reason — e.g. `consent_required` if the authorisation was dismissed |
| "You need the Manage Server permission" | Correct — grant yourself that role, or use an account that has it |
| Signed out after every deploy | `SESSION_SECRET` isn't set, so it's regenerated on each boot |
| Settings revert after a deploy | No volume mounted at `DATA_DIR` |
| Railway: "Application failed to respond" | The proxy can't reach the port. Don't set `PORT` yourself — Railway injects it; delete the variable if you added one. Then check the domain's **target port** matches the port in the log line `dashboard on port …` |
| A page saying "Almost there" | The dashboard is up but missing a variable — the page names which one |

## Working on the UI

```bash
npm run preview   # http://localhost:4321
```

That serves the dashboard with stubbed API responses — fake channels, roles and
accounts — so you can work on the interface with no token, no login, and no
deploy. Saving in preview mode is a no-op.

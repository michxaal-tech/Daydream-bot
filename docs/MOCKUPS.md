# Message mockups

Every payload below is generated from the real render code
(`node scripts/generate-mockups.js` → `mockups/payloads/*.json`), so what you
read here is byte-for-byte what Discord receives.

The `┃` down the left edge of each block is the embed accent bar. It is
**lavender `#A78BFA`** everywhere, `#7C5CFF` (deeper violet) for live alerts.
That colour is set once in `config.json → brand.accent`.

```
#A78BFA  ┃ lavender   — default: welcomes, uploads, replies
#C4B5FD  ┃ soft lilac — passive notices
#7C5CFF  ┃ violet     — live / urgent
```

---

## 1. Welcome — `#welcome`

Fires on `guildMemberAdd`. The `@mention` sits in the message **content**, above
the embed, because that is the only part Discord converts into a real ping.

```
Daydream 🤖 APP                                          Today at 6:31 PM
look who showed up — welcome, @lunaaa!

┃ 🟣 lunaaa joined
┃ Welcome to Daydream HQ 💜                                    ┌──────────┐
┃ Hey @lunaaa — glad you made it.                              │  avatar  │
┃                                                              └──────────┘
┃ 📜 Read #rules
┃ 🎨 Grab your roles in #roles
┃ 👋 Say hi in #intros
┃
┃ Member                        Account created
┃ You're the 12,483rd member    5 years ago
┃
┃ Daydream HQ                                          Today at 6:31 PM

  [ 📺 YouTube ]  [ 🎵 TikTok ]  [ 𝕏 X ]

  💜 2   👋 1
```

Greeting lines rotate from a pool in config — the same user always gets the same
line, different users get different ones:

```
{user} just wandered into the daydream. 💜
look who showed up — welcome, {user}!
{user} is member #{count}. the vibes just went up.
new face alert: {user} 👋
{user} just joined the server. say hi, everyone.
```

Tokens available anywhere in a welcome string:
`{user}` `{tag}` `{name}` `{server}` `{count}` `{ordinal}` `{rules}` `{intros}` `{roles}`

<details><summary>Wire payload — <code>mockups/payloads/welcome-channel.json</code></summary>

```json
{
  "content": "look who showed up — welcome, <@284620194716532736>!",
  "allowedMentions": { "users": ["284620194716532736"] },
  "embeds": [
    {
      "color": 10980346,
      "author": { "name": "lunaaa joined", "icon_url": "https://cdn.discordapp.com/avatars/.../a.png" },
      "title": "Welcome to Daydream HQ 💜",
      "description": "Hey <@284620194716532736> — glad you made it.\n\n📜 Read <#RULES>\n🎨 Grab your roles in <#ROLES>\n👋 Say hi in <#INTROS>",
      "thumbnail": { "url": "https://cdn.discordapp.com/avatars/.../a.png?size=256" },
      "fields": [
        { "name": "Member", "value": "You're the **12,483rd** member", "inline": true },
        { "name": "Account created", "value": "<t:1615713120:R>", "inline": true }
      ],
      "footer": { "text": "Daydream HQ" },
      "timestamp": "2026-08-18T18:31:47.221Z"
    }
  ],
  "components": [
    { "type": 1, "components": [
      { "type": 2, "style": 5, "label": "YouTube", "emoji": { "name": "📺" }, "url": "https://youtube.com/@yourhandle" },
      { "type": 2, "style": 5, "label": "TikTok",  "emoji": { "name": "🎵" }, "url": "https://tiktok.com/@yourhandle" },
      { "type": 2, "style": 5, "label": "X",       "emoji": { "name": "𝕏" }, "url": "https://x.com/yourhandle" }
    ]}
  ]
}
```
`"color": 10980346` is `0xA78BFA`.
</details>

---

## 2. Welcome DM

Sent ~1s after the public ping. No mention (you can't ping someone in their own
DMs), same lavender bar.

```
Daydream 🤖 APP

┃ Welcome to Daydream HQ 💜                                    ┌──────────┐
┃ Hey lunaaa — thanks for joining.                             │ server   │
┃                                                              │  icon    │
┃ A few things worth doing first:                              └──────────┘
┃ • Skim the rules so nothing catches you out
┃ • Pick up notification roles so you hear about uploads and streams
┃ • Drop an intro — the server is a lot more fun once people know you
┃
┃ Daydream HQ

  [ 📺 YouTube ]  [ 🎵 TikTok ]  [ 𝕏 X ]
```

---

## 3. YouTube upload — `#uploads`

```
Daydream Uploads 🤖 WEBHOOK                              Today at 6:02 PM
🔔 @YouTube Notifs new upload from Daydream — go watch it 👇

┃ 📺 Daydream · YouTube
┃ i tried every viral food hack for 7 days
┃ day 4 nearly ended me. full breakdown, receipts and the one hack
┃ that actually works.
┃
┃ Length            Views
┃ 14:22             18.4K
┃
┃ ┌──────────────────────────────────────────────────────────┐
┃ │                                                          │
┃ │                  thumbnail  (1280×720)                   │
┃ │                                                          │
┃ └──────────────────────────────────────────────────────────┘
┃ Daydream HQ                                          Today at 6:02 PM

  [ Watch on YouTube ]  [ Profile ]

  💬 12 messages — thread: "💬 i tried every viral food hack for 7 days"
```

`Length` and `Views` only appear when `YOUTUBE_API_KEY` is set — without a key
the RSS feed still gives title, description, thumbnail, link and timestamp.

<details><summary>Wire payload — <code>mockups/payloads/upload-youtube.json</code></summary>

```json
{
  "content": "🔔 <@&1140000000000000001> new upload from **Daydream** — go watch it 👇",
  "embeds": [
    {
      "color": 10980346,
      "author": { "name": "📺 Daydream · YouTube", "url": "https://www.youtube.com/@daydream" },
      "title": "i tried every viral food hack for 7 days",
      "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "description": "day 4 nearly ended me. full breakdown, receipts and the one hack that actually works.",
      "image": { "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg" },
      "fields": [
        { "name": "Length", "value": "14:22", "inline": true },
        { "name": "Views", "value": "18.4K", "inline": true }
      ],
      "footer": { "text": "Daydream HQ" },
      "timestamp": "2026-08-18T17:02:00.000Z"
    }
  ],
  "components": [
    { "type": 1, "components": [
      { "type": 2, "style": 5, "label": "Watch on YouTube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      { "type": 2, "style": 5, "label": "Profile", "url": "https://www.youtube.com/@daydream" }
    ]}
  ],
  "username": "Daydream Uploads",
  "allowed_mentions": { "roles": ["1140000000000000001"] }
}
```
</details>

---

## 4. TikTok post — `#shorts`

```
Daydream Uploads 🤖 WEBHOOK                              Today at 4:40 PM
🎵 @TikTok Notifs Daydream just posted on TikTok

┃ 🎵 @daydream · TikTok
┃ no because why did this actually work 😭 #fyp
┃ no because why did this actually work 😭 #fyp #dayinmylife
┃
┃ ┌──────────────────────┐
┃ │                      │
┃ │   cover  (9:16)      │
┃ │                      │
┃ └──────────────────────┘
┃ Daydream HQ                                          Today at 4:40 PM

  [ Watch on TikTok ]  [ Profile ]
```

---

## 5. X post — `#x-posts`

No image on a text-only post, so the embed collapses to two lines. Likes and
reposts only appear on the API v2 path (`X_BEARER_TOKEN` set).

```
Daydream Uploads 🤖 WEBHOOK                              Today at 6:06 PM
𝕏 @X Notifs Daydream (@daydream) posted

┃ 𝕏 Daydream (@daydream) · X
┃ new video is live. it took 3 weeks and one minor breakdown 🫠
┃
┃ Likes             Reposts
┃ 2.3K              188
┃
┃ Daydream HQ                                          Today at 6:06 PM

  [ Watch on X ]  [ Profile ]
```

---

## 6. Twitch live — `#live-now`

The one embed that switches to the deeper violet (`#7C5CFF`), so a live alert
reads differently at a glance from an upload.

```
Daydream Uploads 🤖 WEBHOOK                              Today at 8:00 PM
🔴 @Live Notifs Daydream is LIVE

┃ 🔴 daydream · Twitch
┃ editing the new vid with you all + chill
┃ Playing Just Chatting
┃
┃ Watching          Category
┃ 1K                Just Chatting
┃
┃ ┌──────────────────────────────────────────────────────────┐
┃ │                  stream preview                          │
┃ └──────────────────────────────────────────────────────────┘
┃ Daydream HQ                                          Today at 8:00 PM

  [ Watch the stream ]  [ Profile ]
```

---

## 7. Command replies

### `/socials`

```
┃ Daydream — everywhere else
┃ 📺 YouTube → https://youtube.com/@yourhandle
┃ 🎵 TikTok → https://tiktok.com/@yourhandle
┃ 𝕏 X → https://x.com/yourhandle
┃ 📸 Instagram → https://instagram.com/yourhandle
┃ 🔴 Twitch → https://twitch.tv/yourhandle
┃
┃ Business enquiries
┃ business@yourdomain.com
┃ Daydream HQ

  [ 📺 YouTube ] [ 🎵 TikTok ] [ 𝕏 X ] [ 📸 Instagram ] [ 🔴 Twitch ]
```

### `/notify list`  *(ephemeral — only the admin sees it)*

```
┃ 📡 Watched accounts
┃ ✅ 📺 yt-main · @yourhandle
┃  └ #uploads · @YouTube Notifs
┃ ✅ 🎵 tiktok-main · yourhandle
┃  └ #shorts · @TikTok Notifs
┃ ✅ 𝕏 x-main · yourhandle
┃  └ via webhook · no ping
┃ ⏸️ 🔴 twitch-main · yourhandle
┃  └ #live-now · @Live Notifs
┃ Daydream HQ
```

### `/welcome preview` *(ephemeral, no ping fired)* and `/ping`

```
┃ 🏓 pong
┃ Gateway           Uptime
┃ 42ms              2 days ago
┃ Daydream HQ
```

---

## 8. Goodbye — plain text, no embed, no ping

```
Daydream 🤖 APP                                          Today at 9:14 PM
lunaaa drifted off. (12,482 left)
```

---

## Bot vs webhook — which to use

| | Bot message | Webhook |
|---|---|---|
| Sender name | Your bot's name, `APP` tag | Anything — `Daydream Uploads`, `YouTube`, per-platform avatars |
| Setup | Nothing extra | Create a webhook per channel, paste the URL into `webhookUrl` |
| Threads / crossposting | ✅ | ❌ (send as the bot for those) |
| Rate limits | Shared with the bot | Separate bucket — better when 5 platforms fire at once |
| Editing later | ✅ | ✅ (via the same webhook) |

Set `webhookUrl` on an account to use a webhook; leave it empty to post as the
bot. `#uploads` looks best as a webhook (branded sender), `#live-now` as the bot
(so it can auto-thread).

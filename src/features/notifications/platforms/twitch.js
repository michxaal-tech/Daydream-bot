import { fetchJson } from '../../../lib/http.js';
import { env } from '../../../lib/config.js';
import { getMeta, setMeta } from '../../../lib/store.js';

/**
 * Twitch is a "is the stream up right now" check rather than a feed. The post id
 * is the stream id, so a single live session announces exactly once — and a new
 * session later the same day still gets its own announcement.
 */
export default {
  id: 'twitch',
  label: 'Twitch',

  async fetchLatest(account) {
    if (!env.twitchClientId || !env.twitchClientSecret) {
      throw new Error('twitch needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET');
    }
    const login = String(account.handle ?? '').replace(/^@/, '').toLowerCase();
    const token = await appToken();
    const headers = { 'client-id': env.twitchClientId, authorization: `Bearer ${token}` };

    const data = await fetchJson(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`,
      { headers }
    );
    const stream = data.data?.[0];
    if (!stream) return []; // offline — nothing to announce

    return [
      {
        id: `tw:${stream.id}`,
        externalId: stream.id,
        url: `https://twitch.tv/${login}`,
        title: stream.title || 'Live now',
        description: stream.game_name ? `Playing **${stream.game_name}**` : '',
        thumbnail: (stream.thumbnail_url ?? '')
          .replace('{width}', '1280')
          .replace('{height}', '720'),
        author: stream.user_name ?? login,
        authorUrl: `https://twitch.tv/${login}`,
        publishedAt: new Date(stream.started_at ?? Date.now()),
        kind: 'live',
        stats: { viewers: stream.viewer_count ?? null, game: stream.game_name ?? null },
      },
    ];
  },
};

/** Cached client-credentials token — Twitch tokens last ~60 days. */
async function appToken() {
  const cached = getMeta('twitch:token');
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.twitchClientId,
      client_secret: env.twitchClientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`twitch auth failed: HTTP ${res.status}`);
  const json = await res.json();
  setMeta('twitch:token', {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

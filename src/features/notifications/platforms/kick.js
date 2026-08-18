import { fetchJson } from '../../../lib/http.js';

/** Kick exposes a public channel endpoint; livestream is null when offline. */
export default {
  id: 'kick',
  label: 'Kick',

  async fetchLatest(account) {
    const slug = String(account.handle ?? '').replace(/^@/, '').toLowerCase();
    const data = await fetchJson(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`);
    const live = data?.livestream;
    if (!live) return [];

    return [
      {
        id: `kick:${live.id}`,
        externalId: String(live.id),
        url: `https://kick.com/${slug}`,
        title: live.session_title || 'Live now',
        description: live.categories?.[0]?.name ? `Playing **${live.categories[0].name}**` : '',
        thumbnail: live.thumbnail?.url ?? null,
        author: data?.user?.username ?? slug,
        authorUrl: `https://kick.com/${slug}`,
        publishedAt: new Date(live.created_at ?? Date.now()),
        kind: 'live',
        stats: { viewers: live.viewer_count ?? null },
      },
    ];
  },
};

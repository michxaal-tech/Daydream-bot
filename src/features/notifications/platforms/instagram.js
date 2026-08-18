import { fetchFeed, stripHtml, truncate } from '../../../lib/http.js';
import { env } from '../../../lib/config.js';

/**
 * Instagram's official Graph API only covers Business/Creator accounts you own.
 * Default here is the same RSS-bridge approach as TikTok; set `feedUrl` on the
 * account to point at whatever bridge you end up trusting.
 */
export default {
  id: 'instagram',
  label: 'Instagram',

  async fetchLatest(account) {
    const handle = String(account.handle ?? '').replace(/^@/, '');
    const url = account.feedUrl || `${env.rsshubBase}/instagram/user/${encodeURIComponent(handle)}`;
    const entries = await fetchFeed(url);

    return entries.filter(Boolean).map((e) => {
      const link = String(typeof e.link === 'string' ? e.link : e.link?.['@_href'] ?? '');
      const shortcode = link.match(/\/(?:p|reel|tv)\/([\w-]+)/)?.[1] ?? link;
      const body = e.description ?? '';
      return {
        id: `ig:${shortcode}`,
        externalId: String(shortcode),
        url: link || `https://instagram.com/${handle}`,
        title: truncate(stripHtml(e.title ?? 'New post'), 200),
        description: truncate(stripHtml(body), 300),
        thumbnail: String(body).match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null,
        author: `@${handle}`,
        authorUrl: `https://instagram.com/${handle}`,
        publishedAt: new Date(e.pubDate ?? e.published ?? Date.now()),
        kind: link.includes('/reel/') ? 'video' : 'post',
        stats: {},
      };
    });
  },
};

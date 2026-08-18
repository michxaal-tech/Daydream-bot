import { fetchFeed, stripHtml, truncate } from '../../../lib/http.js';
import { env } from '../../../lib/config.js';

/**
 * TikTok has no public, key-free feed. The reliable options are:
 *   1. RSSHub  (self-host it — the public instance is rate-limited hard)
 *      /tiktok/user/@handle
 *   2. A paid scraper (Apify, EnsembleData) — set account.feedUrl to its RSS/JSON.
 * Either way the adapter just consumes an RSS feed, so swapping providers is a
 * one-line config change: set `feedUrl` on the account.
 */
export default {
  id: 'tiktok',
  label: 'TikTok',

  async fetchLatest(account) {
    const handle = String(account.handle ?? '').replace(/^@/, '');
    const url = account.feedUrl || `${env.rsshubBase}/tiktok/user/@${encodeURIComponent(handle)}`;
    const entries = await fetchFeed(url);

    return entries.filter(Boolean).map((e) => {
      const link = typeof e.link === 'string' ? e.link : e.link?.['@_href'] ?? '';
      const videoId = link.match(/\/video\/(\d+)/)?.[1] ?? e.guid?.['#text'] ?? e.guid ?? link;
      const body = e.description ?? e.content?.['#text'] ?? '';
      return {
        id: `tt:${videoId}`,
        externalId: String(videoId),
        url: link || `https://www.tiktok.com/@${handle}`,
        title: truncate(stripHtml(e.title ?? 'New TikTok'), 200),
        description: truncate(stripHtml(body), 300),
        thumbnail: String(body).match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null,
        author: `@${handle}`,
        authorUrl: `https://www.tiktok.com/@${handle}`,
        publishedAt: new Date(e.pubDate ?? e.published ?? Date.now()),
        kind: 'video',
        stats: {},
      };
    });
  },
};

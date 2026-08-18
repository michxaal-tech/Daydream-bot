import { fetchFeed, fetchJson, stripHtml, truncate } from '../../../lib/http.js';
import { env } from '../../../lib/config.js';
import { getMeta, setMeta } from '../../../lib/store.js';

/**
 * Two paths, picked automatically:
 *   • X_BEARER_TOKEN set  → official API v2 (/2/users/:id/tweets)
 *   • otherwise           → a Nitter RSS mirror (free, but mirrors come and go)
 */
export default {
  id: 'x',
  label: 'X',

  async fetchLatest(account) {
    const handle = String(account.handle ?? '').replace(/^@/, '');
    return env.xBearer ? viaApi(handle, account) : viaNitter(handle, account);
  },
};

async function viaApi(handle, account) {
  const headers = { authorization: `Bearer ${env.xBearer}` };

  let userId = getMeta(`x:userid:${handle}`);
  if (!userId) {
    const who = await fetchJson(`https://api.x.com/2/users/by/username/${handle}`, { headers });
    userId = who?.data?.id;
    if (!userId) throw new Error(`x: could not resolve @${handle}`);
    setMeta(`x:userid:${handle}`, userId);
  }

  const exclude = [
    account.includeReplies ? null : 'replies',
    account.includeRetweets ? null : 'retweets',
  ].filter(Boolean);

  const params = new URLSearchParams({
    max_results: '10',
    'tweet.fields': 'created_at,attachments,public_metrics,entities',
    'media.fields': 'url,preview_image_url,type',
    expansions: 'attachments.media_keys,author_id',
    'user.fields': 'name,username,profile_image_url',
  });
  if (exclude.length) params.set('exclude', exclude.join(','));

  const data = await fetchJson(`https://api.x.com/2/users/${userId}/tweets?${params}`, { headers });
  const media = Object.fromEntries((data.includes?.media ?? []).map((m) => [m.media_key, m]));
  const user = data.includes?.users?.[0];

  return (data.data ?? []).map((t) => {
    const firstKey = t.attachments?.media_keys?.[0];
    const m = firstKey ? media[firstKey] : null;
    return {
      id: `x:${t.id}`,
      externalId: t.id,
      url: `https://x.com/${handle}/status/${t.id}`,
      title: truncate(stripHtml(t.text), 200),
      description: truncate(stripHtml(t.text), 500),
      thumbnail: m?.url ?? m?.preview_image_url ?? null,
      author: user?.name ? `${user.name} (@${handle})` : `@${handle}`,
      authorUrl: `https://x.com/${handle}`,
      avatar: user?.profile_image_url ?? null,
      publishedAt: new Date(t.created_at ?? Date.now()),
      kind: 'post',
      stats: {
        likes: t.public_metrics?.like_count ?? null,
        reposts: t.public_metrics?.retweet_count ?? null,
      },
    };
  });
}

async function viaNitter(handle, account) {
  const entries = await fetchFeed(account.feedUrl || `${env.nitterBase}/${handle}/rss`);

  return entries
    .filter(Boolean)
    .filter((e) => account.includeRetweets || !String(e.title ?? '').startsWith('RT by'))
    .filter((e) => account.includeReplies || !String(e.title ?? '').startsWith('R to'))
    .map((e) => {
      const link = String(typeof e.link === 'string' ? e.link : e.link?.['@_href'] ?? '');
      const id = link.match(/status\/(\d+)/)?.[1] ?? link;
      const body = e.description ?? '';
      return {
        id: `x:${id}`,
        externalId: String(id),
        url: link.replace(/https?:\/\/[^/]+/, 'https://x.com').replace(/#m$/, ''),
        title: truncate(stripHtml(e.title ?? 'New post'), 200),
        description: truncate(stripHtml(body), 500),
        thumbnail: String(body).match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null,
        author: `@${handle}`,
        authorUrl: `https://x.com/${handle}`,
        publishedAt: new Date(e.pubDate ?? Date.now()),
        kind: 'post',
        stats: {},
      };
    });
}

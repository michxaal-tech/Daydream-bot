import { fetchFeed, fetchJson, stripHtml, truncate } from '../../../lib/http.js';
import { env } from '../../../lib/config.js';

/**
 * YouTube ships a public Atom feed per channel — no API key, no quota:
 *   https://www.youtube.com/feeds/videos.xml?channel_id=UC...
 * An API key is optional and only used to enrich the embed (duration, views).
 */
export default {
  id: 'youtube',
  label: 'YouTube',

  /** @param {object} account config entry — needs `channelId` (UC...) */
  async fetchLatest(account) {
    const channelId = account.channelId;
    if (!channelId || !channelId.startsWith('UC')) {
      throw new Error(
        `youtube account "${account.id}" needs a channelId starting with UC. ` +
          'Find it at youtube.com/account_advanced, or view-source on the channel page and search "channelId".'
      );
    }

    const entries = await fetchFeed(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
    );

    const posts = entries.filter(Boolean).map((e) => {
      const videoId = e['yt:videoId'] ?? e.id?.split(':').pop();
      const media = e['media:group'] ?? {};
      return {
        id: `yt:${videoId}`,
        externalId: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: stripHtml(e.title ?? 'New video'),
        description: truncate(stripHtml(media['media:description'] ?? ''), 300),
        thumbnail: media['media:thumbnail']?.['@_url'] ?? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        author: e.author?.name ?? account.handle,
        authorUrl: e.author?.uri ?? `https://www.youtube.com/channel/${channelId}`,
        publishedAt: new Date(e.published ?? Date.now()),
        kind: 'video',
        stats: {},
      };
    });

    if (env.youtubeApiKey && posts.length) {
      await enrich(posts.slice(0, 5));
    }
    return posts;
  },
};

/** Optional: fill in duration / views / short-vs-long via the Data API. */
async function enrich(posts) {
  try {
    const ids = posts.map((p) => p.externalId).join(',');
    const data = await fetchJson(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${ids}&key=${env.youtubeApiKey}`
    );
    for (const item of data.items ?? []) {
      const post = posts.find((p) => p.externalId === item.id);
      if (!post) continue;
      const seconds = isoDurationToSeconds(item.contentDetails?.duration);
      post.stats = {
        duration: seconds ? formatDuration(seconds) : null,
        views: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
      };
      if (seconds && seconds <= 60) post.kind = 'short';
      if (item.snippet?.liveBroadcastContent === 'live') post.kind = 'live';
    }
  } catch {
    // Enrichment is a nice-to-have; never let it block an announcement.
  }
}

function isoDurationToSeconds(iso = '') {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function formatDuration(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

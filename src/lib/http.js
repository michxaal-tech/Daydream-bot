import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const UA =
  'Mozilla/5.0 (compatible; DaydreamBot/0.1; +https://github.com/michxaal-tech/Daydream-bot)';

export async function fetchText(url, { headers = {}, timeoutMs = 12_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: '*/*', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}) {
  return JSON.parse(await fetchText(url, opts));
}

/** Parse an RSS 2.0 or Atom document into a flat list of entries. */
export async function fetchFeed(url, opts = {}) {
  const xml = await fetchText(url, { accept: 'application/rss+xml, application/atom+xml', ...opts });
  const doc = parser.parse(xml);
  const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Strip HTML tags and collapse whitespace — feed titles love to smuggle markup. */
export function stripHtml(input = '') {
  return String(input)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text = '', max = 280) {
  const clean = String(text);
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

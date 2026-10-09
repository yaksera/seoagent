import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { assertPublicUrl, safeFetch } from './safe-fetch';

export type PageData = {
  url: string;
  finalUrl: string;
  status: number;
  redirectChain: { url: string; status: number }[];
  isHtml: boolean;
  title: string;
  metaDescription: string;
  metaRobots: string;
  xRobotsTag: string;
  canonical: string;
  h1: string[];
  headings: { level: number; text: string }[];
  wordCount: number;
  text: string;
  images: { src: string; alt: string | null }[];
  internalLinks: string[];
  lang: string;
  hasViewport: boolean;
  jsonLdCount: number;
  jsonLdInvalid: number;
  responseMs: number;
  error?: string;
};

export type CrawlResult = {
  startUrl: string;
  host: string;
  https: boolean;
  robotsFound: boolean;
  sitemapFound: boolean;
  sitemapUrls: string[];
  blockedByRobots: string[];
  pages: PageData[];
  limitReached: boolean;
};

const SKIP_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|rar|gz|mp4|webm|mp3|wav|css|js|json|xml|txt|woff2?|ttf|eot|docx?|xlsx?|pptx?)$/i;
const TRACKING = /^(utm_|gclid$|fbclid$|mc_|ref$|_ga$)/i;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

export function normaliseUrl(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
    return u.href;
  } catch {
    return null;
  }
}

export function extractPage(html: string, pageUrl: string, host: string) {
  const $ = cheerio.load(html);
  const jsonLd = $('script[type="application/ld+json"]').toArray().map(el => $(el).text());
  let jsonLdInvalid = 0;
  for (const block of jsonLd) { try { JSON.parse(block); } catch { jsonLdInvalid++; } }

  const internalLinks = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (/^(mailto|tel|javascript):/i.test(href)) return;
    const n = normaliseUrl(href, pageUrl);
    if (n && bareHost(new URL(n).hostname) === host && !SKIP_EXT.test(new URL(n).pathname)) internalLinks.add(n);
  });

  const images = $('img').toArray().map(el => ({ src: normaliseUrl($(el).attr('src') ?? '', pageUrl) ?? ($(el).attr('src') ?? ''), alt: $(el).attr('alt') ?? null }));
  const headings = $('h1,h2,h3').toArray().map(el => ({ level: Number(el.tagName[1]), text: $(el).text().replace(/\s+/g, ' ').trim() }));

  $('script,style,noscript,svg,template,iframe').remove();
  const main = $('main').length ? $('main') : $('body');
  const text = main.text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ') : [];
  const canonicalHref = $('link[rel="canonical"]').attr('href');

  return {
    title: $('title').first().text().replace(/\s+/g, ' ').trim(),
    metaDescription: ($('meta[name="description"]').attr('content') ?? '').trim(),
    metaRobots: ($('meta[name="robots"]').attr('content') ?? '').toLowerCase(),
    canonical: canonicalHref ? normaliseUrl(canonicalHref, pageUrl) ?? canonicalHref : '',
    h1: headings.filter(h => h.level === 1).map(h => h.text),
    headings,
    wordCount: words.length,
    text: words.slice(0, 1500).join(' '),
    images,
    internalLinks: [...internalLinks],
    lang: $('html').attr('lang') ?? '',
    hasViewport: $('meta[name="viewport"]').length > 0,
    jsonLdCount: jsonLd.length,
    jsonLdInvalid,
  };
}

async function readSitemaps(urls: string[], ua: string, host: string): Promise<string[]> {
  const found = new Set<string>();
  const queue = [...urls];
  let fetched = 0;
  while (queue.length && fetched < 5) {
    const sm = queue.shift()!;
    fetched++;
    try {
      const res = await safeFetch(sm, { userAgent: ua, maxBytes: 5_000_000 });
      if (res.status !== 200) continue;
      const locs = [...res.body.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map(m => m[1]);
      const isIndex = /<sitemapindex/i.test(res.body);
      for (const loc of locs) {
        const n = normaliseUrl(loc);
        if (!n || bareHost(new URL(n).hostname) !== host) continue;
        if (isIndex) queue.push(n); else found.add(n);
      }
    } catch { /* missing sitemap is reported as an issue, not an error */ }
  }
  return [...found];
}

export async function crawlSite(startRaw: string, opts: { maxPages: number; userAgent: string; delayMs?: number; concurrency?: number }): Promise<CrawlResult> {
  const { maxPages, userAgent, delayMs = 300, concurrency = 3 } = opts;
  const withScheme = /^https?:\/\//i.test(startRaw) ? startRaw : `https://${startRaw}`;
  const start = await assertPublicUrl(withScheme);
  // Resolve the real home URL first (http→https, www redirects).
  const home = await safeFetch(start.href, { userAgent, readBody: () => false });
  const origin = new URL(home.url).origin;
  const host = bareHost(new URL(home.url).hostname);

  let robots: ReturnType<typeof robotsParser> | null = null;
  let robotsFound = false;
  let sitemapCandidates = [`${origin}/sitemap.xml`];
  try {
    const r = await safeFetch(`${origin}/robots.txt`, { userAgent, maxBytes: 500_000 });
    if (r.status === 200 && !/<html/i.test(r.body)) {
      robotsFound = true;
      robots = robotsParser(`${origin}/robots.txt`, r.body);
      const listed = robots.getSitemaps();
      if (listed.length) sitemapCandidates = listed;
    }
  } catch { /* treated as no robots.txt */ }

  const sitemapUrls = await readSitemaps(sitemapCandidates, userAgent, host);
  const seen = new Set<string>();
  const queue: string[] = [];
  const enqueue = (u: string) => { if (!seen.has(u)) { seen.add(u); queue.push(u); } };
  enqueue(normaliseUrl(home.url)!);
  sitemapUrls.forEach(enqueue);

  const pages: PageData[] = [];
  const blockedByRobots: string[] = [];

  async function crawlOne(url: string) {
    if (robots && robots.isAllowed(url, userAgent) === false) { blockedByRobots.push(url); return; }
    try {
      const res = await safeFetch(url, { userAgent, readBody: ct => ct.includes('html') });
      const isHtml = (res.headers.get('content-type') ?? '').includes('html');
      const base: PageData = {
        url, finalUrl: res.url, status: res.status, redirectChain: res.redirectChain, isHtml,
        title: '', metaDescription: '', metaRobots: '', xRobotsTag: (res.headers.get('x-robots-tag') ?? '').toLowerCase(),
        canonical: '', h1: [], headings: [], wordCount: 0, text: '', images: [], internalLinks: [], lang: '',
        hasViewport: false, jsonLdCount: 0, jsonLdInvalid: 0, responseMs: res.responseMs,
      };
      if (isHtml && res.status < 400) {
        Object.assign(base, extractPage(res.body, res.url, host));
        for (const link of base.internalLinks) if (seen.size < maxPages * 3) enqueue(link);
      }
      pages.push(base);
    } catch (e) {
      pages.push({
        url, finalUrl: url, status: 0, redirectChain: [], isHtml: false, title: '', metaDescription: '', metaRobots: '',
        xRobotsTag: '', canonical: '', h1: [], headings: [], wordCount: 0, text: '', images: [], internalLinks: [], lang: '',
        hasViewport: false, jsonLdCount: 0, jsonLdInvalid: 0, responseMs: 0, error: e instanceof Error ? e.message : 'Fetch failed',
      });
    }
  }

  while (queue.length && pages.length < maxPages) {
    const batch = queue.splice(0, Math.min(concurrency, maxPages - pages.length));
    await Promise.all(batch.map(crawlOne));
    if (queue.length) await sleep(delayMs);
  }

  return {
    startUrl: home.url, host, https: new URL(home.url).protocol === 'https:', robotsFound,
    sitemapFound: sitemapUrls.length > 0, sitemapUrls, blockedByRobots, pages,
    limitReached: pages.length >= maxPages && queue.length > 0,
  };
}

import { describe, expect, it } from 'vitest';
import { extractPage, normaliseUrl, type CrawlResult, type PageData } from './crawler';
import { runAudit } from './rules';
import { assertPublicUrl, isBlockedIp } from './safe-fetch';

describe('SSRF protection', () => {
  it.each(['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', '::ffff:127.0.0.1'])('blocks %s', ip => {
    expect(isBlockedIp(ip)).toBe(true);
  });
  it('allows public IPs', () => expect(isBlockedIp('93.184.216.34')).toBe(false));
  it.each(['http://localhost', 'http://2130706433', 'http://0x7f000001', 'file:///etc/passwd', 'http://user:pass@example.com'])('rejects %s', async url => {
    await expect(assertPublicUrl(url)).rejects.toThrow();
  });
});

describe('crawler helpers', () => {
  it('normalises URLs and strips tracking params', () => {
    expect(normaliseUrl('/a?utm_source=x&id=2#top', 'https://Example.com')).toBe('https://example.com/a?id=2');
  });
  it('extracts page data', () => {
    const html = `<html lang="en"><head><title>Hello</title><meta name="description" content="Desc"><script type="application/ld+json">{bad</script></head>
      <body><h1>One</h1><h1>Two</h1><img src="/a.png"><img src="/b.png" alt=""><a href="/about">About</a><a href="https://other.com">x</a><p>word word word</p></body></html>`;
    const p = extractPage(html, 'https://www.site.com/', 'site.com');
    expect(p.title).toBe('Hello');
    expect(p.h1).toEqual(['One', 'Two']);
    expect(p.images.filter(i => i.alt === null)).toHaveLength(1);
    expect(p.internalLinks).toEqual(['https://www.site.com/about']);
    expect(p.jsonLdInvalid).toBe(1);
  });
});

const page = (over: Partial<PageData>): PageData => ({
  url: 'https://site.com/', finalUrl: 'https://site.com/', status: 200, redirectChain: [], isHtml: true, title: 'A good page title that is long enough',
  metaDescription: 'x'.repeat(130), metaRobots: '', xRobotsTag: '', canonical: '', h1: ['Heading'], headings: [], wordCount: 500, text: '',
  images: [], internalLinks: [], lang: 'en', hasViewport: true, jsonLdCount: 1, jsonLdInvalid: 0, responseMs: 100, ...over,
});
const crawl = (pages: PageData[]): CrawlResult => ({
  startUrl: 'https://site.com/', host: 'site.com', https: true, robotsFound: true, sitemapFound: true, sitemapUrls: [], blockedByRobots: [], pages, limitReached: false,
});

describe('audit rules', () => {
  it('scores a clean site 100', () => {
    expect(runAudit(crawl([page({})])).score).toBe(100);
  });
  it('finds noindex, missing title, duplicates and broken pages', () => {
    const { issues, score } = runAudit(crawl([
      page({ metaRobots: 'noindex' }),
      page({ url: 'https://site.com/a', finalUrl: 'https://site.com/a', title: '' }),
      page({ url: 'https://site.com/b', finalUrl: 'https://site.com/b', title: 'Same', metaDescription: 'dup' }),
      page({ url: 'https://site.com/c', finalUrl: 'https://site.com/c', title: 'Same', metaDescription: 'dup' }),
      page({ url: 'https://site.com/d', finalUrl: 'https://site.com/d', status: 404 }),
    ]));
    const ids = issues.map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining(['noindex', 'title-missing', 'title-duplicate', 'meta-duplicate', 'broken']));
    expect(issues[0].severity).toBe('critical');
    expect(score).toBeLessThan(80);
  });
});

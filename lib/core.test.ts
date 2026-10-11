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

describe('AI readiness', async () => {
  const { scoreAiReadiness } = await import('./ai-readiness');
  const noProbe = { llmsTxt: false, markdown: false, linkHeader: false, apiCatalog: false, mcpCard: false, agentSkills: false, oauthMeta: false };
  const good = page({ wordCount: 400, jsonLdTypes: ['LocalBusiness'], firstParagraphWords: 30, h2Count: 3, phones: ['+97714000000'], socialLinks: ['https://facebook.com/x'] });

  it('flags AI search bots blocked in robots.txt with a fix snippet', () => {
    const c = { ...crawl([good]), robotsTxt: 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n' };
    const r = scoreAiReadiness(c, noProbe);
    const check = r.checks.find(x => x.id === 'ai-search-bots')!;
    expect(check.status).not.toBe('pass');
    expect(check.snippet).toContain('User-agent: OAI-SearchBot');
    expect(r.bots.find(b => b.bot === 'PerplexityBot')?.allowed).toBe(false);
    expect(r.bots.find(b => b.bot === 'ClaudeBot')?.allowed).toBe(true);
  });

  it('scores a well-prepared site high and a JavaScript-only site low', () => {
    const ready = scoreAiReadiness({ ...crawl([good, page({ ...good, url: 'https://site.com/about', title: 'About us' }), page({ ...good, url: 'https://site.com/contact', title: 'Contact' })]),
      robotsTxt: 'User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\nContent-Signal: search=yes\nSitemap: https://site.com/sitemap.xml', sitemapIsXml: true, sitemapInRobots: true, sitemapHasLastmod: true },
      { ...noProbe, llmsTxt: true });
    const jsOnly = scoreAiReadiness(crawl([page({ wordCount: 5, jsonLdTypes: [] })]), noProbe);
    expect(ready.score).toBeGreaterThanOrEqual(80);
    expect(jsOnly.score).toBeLessThan(40);
  });
});

describe('Brand Memory and AI feed', async () => {
  const { buildJsonLd, buildLlmsTxt, parseBrandForm } = await import('./brand');
  const form = new FormData();
  Object.entries({ businessName: 'Yeti Plumbing', schemaType: 'HomeAndConstructionBusiness', description: 'Plumbers in Kathmandu.', services: 'Leak repair\nBoiler service\n',
    areaServed: 'Kathmandu Valley', street: '', city: 'Kathmandu', region: '', postalCode: '', country: 'NP', phone: '+977 1 400 0000', email: 'hi@yeti.np',
    hours: 'Mo-Fr 09:00-17:00', priceRange: '$$', logoUrl: '', sameAs: 'https://facebook.com/yeti', faq_q_0: 'Do you do emergencies?', faq_a_0: 'Yes, 24/7.' }).forEach(([k, v]) => form.set(k, v));

  it('parses the form and builds JSON-LD with only provided facts', () => {
    const { data, error } = parseBrandForm(form);
    expect(error).toBeUndefined();
    expect(data!.services).toEqual(['Leak repair', 'Boiler service']);
    const ld = buildJsonLd(data!, 'https://yeti.np/') as Record<string, unknown>;
    expect(ld['@type']).toBe('HomeAndConstructionBusiness');
    expect(ld.telephone).toBe('+977 1 400 0000');
    expect(ld).not.toHaveProperty('logo');
    expect((ld.address as Record<string, string>).addressLocality).toBe('Kathmandu');
  });

  it('builds llms.txt with summary, services, pages and FAQs', () => {
    const txt = buildLlmsTxt(parseBrandForm(form).data!, crawl([page({ title: 'Home | Yeti', metaDescription: 'Fast plumbers' })]));
    expect(txt).toMatch(/^# Yeti Plumbing\n\n> Plumbers in Kathmandu\./);
    expect(txt).toContain('- Leak repair');
    expect(txt).toContain('- [Home | Yeti](https://site.com/): Fast plumbers');
    expect(txt).toContain('### Do you do emergencies?');
  });

  it('rejects social links that are not URLs', () => {
    const bad = new FormData(); form.forEach((v, k) => bad.set(k, v)); bad.set('sameAs', 'facebook yeti');
    expect(parseBrandForm(bad).error).toMatch(/full URLs/);
  });
});

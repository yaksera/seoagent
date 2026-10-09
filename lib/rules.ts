import type { CrawlResult, PageData } from './crawler';

export type Severity = 'critical' | 'warning' | 'info';
export type Finding = { url: string; detail?: string };
export type Issue = {
  id: string;
  name: string;
  category: 'Indexing' | 'Errors' | 'Titles & descriptions' | 'Headings' | 'Content' | 'Images' | 'Technical';
  severity: Severity;
  fixable: boolean; // the AI can suggest a fix
  why: string;
  findings: Finding[];
};

type Rule = Omit<Issue, 'findings'> & { check: (ctx: Ctx) => Finding[] };
type Ctx = { crawl: CrawlResult; ok: PageData[]; indexable: PageData[]; inlinks: Map<string, number> };

const isNoindex = (p: PageData) => /noindex/.test(p.metaRobots) || /noindex/.test(p.xRobotsTag);
const dupes = (pages: PageData[], key: (p: PageData) => string): Finding[] => {
  const groups = new Map<string, PageData[]>();
  for (const p of pages) { const k = key(p).toLowerCase(); if (k) groups.set(k, [...(groups.get(k) ?? []), p]); }
  return [...groups.values()].filter(g => g.length > 1).flatMap(g => g.map(p => ({ url: p.url, detail: `Shared with ${g.length - 1} other page${g.length > 2 ? 's' : ''}` })));
};

const rules: Rule[] = [
  { id: 'no-https', name: 'Site is not served over HTTPS', category: 'Technical', severity: 'critical', fixable: false,
    why: 'Browsers mark the site as "Not secure" and Google prefers secure pages.',
    check: ({ crawl }) => (crawl.https ? [] : [{ url: crawl.startUrl }]) },
  { id: 'noindex', name: 'Page is hidden from Google (noindex)', category: 'Indexing', severity: 'critical', fixable: false,
    why: 'These pages tell Google not to show them in search. Fine for thank-you or admin pages, a serious problem for anything else.',
    check: ({ ok }) => ok.filter(isNoindex).map(p => ({ url: p.url, detail: p.xRobotsTag.includes('noindex') ? 'X-Robots-Tag header' : 'meta robots tag' })) },
  { id: 'broken', name: 'Broken pages (4xx)', category: 'Errors', severity: 'critical', fixable: false,
    why: 'Visitors and Google hit a dead end. Links pointing here waste their value.',
    check: ({ crawl }) => crawl.pages.filter(p => p.status >= 400 && p.status < 500).map(p => ({ url: p.url, detail: `Status ${p.status}` })) },
  { id: 'server-error', name: 'Server errors (5xx) or unreachable pages', category: 'Errors', severity: 'critical', fixable: false,
    why: 'The server failed to return the page. If Google sees this often it crawls the site less.',
    check: ({ crawl }) => crawl.pages.filter(p => p.status >= 500 || p.status === 0).map(p => ({ url: p.url, detail: p.error ?? `Status ${p.status}` })) },
  { id: 'redirect-chain', name: 'Redirect chains', category: 'Errors', severity: 'warning', fixable: false,
    why: 'Each extra redirect slows the page down and can lose ranking signals. Link straight to the final URL.',
    check: ({ crawl }) => crawl.pages.filter(p => p.redirectChain.length > 1).map(p => ({ url: p.url, detail: `${p.redirectChain.length} hops to ${p.finalUrl}` })) },
  { id: 'canonical-elsewhere', name: 'Canonical points to a different URL', category: 'Indexing', severity: 'warning', fixable: false,
    why: 'The page asks Google to rank another URL instead. Check this is intended.',
    check: ({ indexable }) => indexable.filter(p => p.canonical && p.canonical.replace(/\/$/, '') !== p.finalUrl.replace(/\/$/, '')).map(p => ({ url: p.url, detail: `Canonical: ${p.canonical}` })) },
  { id: 'title-missing', name: 'Missing page title', category: 'Titles & descriptions', severity: 'critical', fixable: true,
    why: 'The title is the blue headline in Google results. Without it Google guesses one.',
    check: ({ indexable }) => indexable.filter(p => !p.title).map(p => ({ url: p.url })) },
  { id: 'title-long', name: 'Title too long (over 60 characters)', category: 'Titles & descriptions', severity: 'warning', fixable: true,
    why: 'Google cuts long titles off, so the important words may not show.',
    check: ({ indexable }) => indexable.filter(p => p.title.length > 60).map(p => ({ url: p.url, detail: `${p.title.length} characters` })) },
  { id: 'title-short', name: 'Title too short (under 30 characters)', category: 'Titles & descriptions', severity: 'warning', fixable: true,
    why: 'A very short title misses the chance to tell searchers what the page offers.',
    check: ({ indexable }) => indexable.filter(p => p.title && p.title.length < 30).map(p => ({ url: p.url, detail: `"${p.title}"` })) },
  { id: 'title-duplicate', name: 'Duplicate titles', category: 'Titles & descriptions', severity: 'warning', fixable: true,
    why: 'Pages with the same title compete with each other and confuse searchers.',
    check: ({ indexable }) => dupes(indexable, p => p.title) },
  { id: 'meta-missing', name: 'Missing meta description', category: 'Titles & descriptions', severity: 'warning', fixable: true,
    why: 'The description is the grey text under the title in Google. A good one gets more clicks.',
    check: ({ indexable }) => indexable.filter(p => !p.metaDescription).map(p => ({ url: p.url })) },
  { id: 'meta-length', name: 'Meta description too long or too short', category: 'Titles & descriptions', severity: 'info', fixable: true,
    why: 'Aim for 120–155 characters so it shows in full and says enough.',
    check: ({ indexable }) => indexable.filter(p => p.metaDescription && (p.metaDescription.length > 160 || p.metaDescription.length < 70)).map(p => ({ url: p.url, detail: `${p.metaDescription.length} characters` })) },
  { id: 'meta-duplicate', name: 'Duplicate meta descriptions', category: 'Titles & descriptions', severity: 'warning', fixable: true,
    why: 'Each page should describe itself. Copies look generic in search results.',
    check: ({ indexable }) => dupes(indexable, p => p.metaDescription) },
  { id: 'h1-missing', name: 'Missing main heading (H1)', category: 'Headings', severity: 'warning', fixable: true,
    why: 'The H1 tells visitors and Google what the page is about at a glance.',
    check: ({ indexable }) => indexable.filter(p => p.h1.length === 0).map(p => ({ url: p.url })) },
  { id: 'h1-multiple', name: 'More than one H1', category: 'Headings', severity: 'info', fixable: true,
    why: 'One clear main heading is easier to understand than several competing ones.',
    check: ({ indexable }) => indexable.filter(p => p.h1.length > 1).map(p => ({ url: p.url, detail: `${p.h1.length} H1 headings` })) },
  { id: 'thin', name: 'Thin content (under 200 words)', category: 'Content', severity: 'warning', fixable: false,
    why: 'Pages with very little text rarely rank. Add useful detail for the visitor.',
    check: ({ indexable }) => indexable.filter(p => p.wordCount < 200).map(p => ({ url: p.url, detail: `${p.wordCount} words` })) },
  { id: 'alt-missing', name: 'Images without alt text', category: 'Images', severity: 'warning', fixable: false,
    why: 'Alt text describes images for screen readers and helps images appear in Google Images.',
    check: ({ ok }) => ok.map(p => ({ p, n: p.images.filter(i => i.alt === null).length })).filter(x => x.n > 0).map(({ p, n }) => ({ url: p.url, detail: `${n} image${n > 1 ? 's' : ''}` })) },
  { id: 'viewport', name: 'Not set up for mobile (no viewport tag)', category: 'Technical', severity: 'warning', fixable: false,
    why: 'Google ranks the mobile version of your site. Without a viewport tag phones show a zoomed-out desktop page.',
    check: ({ ok }) => ok.filter(p => !p.hasViewport).map(p => ({ url: p.url })) },
  { id: 'lang', name: 'Missing language attribute', category: 'Technical', severity: 'info', fixable: false,
    why: 'Declaring the page language helps search engines and screen readers.',
    check: ({ ok }) => ok.filter(p => !p.lang).map(p => ({ url: p.url })) },
  { id: 'jsonld-invalid', name: 'Broken structured data', category: 'Technical', severity: 'warning', fixable: false,
    why: 'The structured data on these pages has syntax errors, so Google ignores it.',
    check: ({ ok }) => ok.filter(p => p.jsonLdInvalid > 0).map(p => ({ url: p.url, detail: `${p.jsonLdInvalid} invalid block${p.jsonLdInvalid > 1 ? 's' : ''}` })) },
  { id: 'no-structured-data', name: 'Home page has no structured data', category: 'Technical', severity: 'info', fixable: false,
    why: 'Organization or LocalBusiness structured data helps Google show your name, logo and details correctly.',
    check: ({ crawl, ok }) => { const home = ok.find(p => p.finalUrl === crawl.startUrl); return home && home.jsonLdCount === 0 ? [{ url: home.url }] : []; } },
  { id: 'no-sitemap', name: 'No XML sitemap found', category: 'Indexing', severity: 'warning', fixable: false,
    why: 'A sitemap lists your pages so Google finds them faster.',
    check: ({ crawl }) => (crawl.sitemapFound ? [] : [{ url: `${new URL(crawl.startUrl).origin}/sitemap.xml` }]) },
  { id: 'orphan', name: 'Pages no other page links to', category: 'Content', severity: 'info', fixable: false,
    why: 'These pages are only in the sitemap. Linking to them from related pages helps visitors and Google find them.',
    check: ({ crawl, indexable, inlinks }) => crawl.limitReached ? [] : indexable.filter(p => p.finalUrl !== crawl.startUrl && !inlinks.get(p.finalUrl) && !inlinks.get(p.url)).map(p => ({ url: p.url })) },
];

const WEIGHT: Record<Severity, number> = { critical: 14, warning: 6, info: 1.5 };

export function runAudit(crawl: CrawlResult): { issues: Issue[]; score: number } {
  const ok = crawl.pages.filter(p => p.isHtml && p.status >= 200 && p.status < 300);
  const indexable = ok.filter(p => !isNoindex(p));
  const inlinks = new Map<string, number>();
  for (const p of ok) for (const l of p.internalLinks) if (l !== p.finalUrl) inlinks.set(l, (inlinks.get(l) ?? 0) + 1);
  const ctx: Ctx = { crawl, ok, indexable, inlinks };

  const issues = rules
    .map(({ check, ...rule }) => ({ ...rule, findings: check(ctx) }))
    .filter(i => i.findings.length > 0)
    .sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity] || b.findings.length - a.findings.length);

  // Each issue costs between 40% and 100% of its weight depending on how much of the site it affects,
  // so one bad page can't sink the score but a site-wide problem shows clearly.
  const total = Math.max(crawl.pages.length, 1);
  const penalty = issues.reduce((sum, i) => sum + WEIGHT[i.severity] * (0.4 + 0.6 * Math.min(1, i.findings.length / total)), 0);
  return { issues, score: Math.max(0, Math.round(100 - penalty)) };
}

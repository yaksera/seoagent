import robotsParser from 'robots-parser';
import type { CrawlResult, PageData } from './crawler';
import { assertPublicUrl, safeFetch } from './safe-fetch';

// AI-readiness: how easily AI assistants (ChatGPT, Claude, Perplexity, Google AI) can find,
// read and act on a site. This is our own weighted measure built from what these crawlers
// document; no AI company publishes an official score.

export type CheckStatus = 'pass' | 'partial' | 'fail';
export type Group = 'Access' | 'Readability' | 'Trust' | 'Agent standards';
export type AiCheck = { id: string; group: Group; name: string; weight: number; status: CheckStatus; earned: number; detail: string; fix?: string; snippet?: string };
export type BotAccess = { bot: string; company: string; purpose: 'search' | 'training' | 'user'; allowed: boolean };
export type AiReadiness = { score: number; level: string; checks: AiCheck[]; bots: BotAccess[]; extras: Record<string, boolean> };

export const AI_BOTS: Omit<BotAccess, 'allowed'>[] = [
  { bot: 'OAI-SearchBot', company: 'ChatGPT search', purpose: 'search' },
  { bot: 'ChatGPT-User', company: 'ChatGPT (when a user asks)', purpose: 'user' },
  { bot: 'GPTBot', company: 'OpenAI model training', purpose: 'training' },
  { bot: 'Claude-SearchBot', company: 'Claude search', purpose: 'search' },
  { bot: 'Claude-User', company: 'Claude (when a user asks)', purpose: 'user' },
  { bot: 'ClaudeBot', company: 'Anthropic model training', purpose: 'training' },
  { bot: 'PerplexityBot', company: 'Perplexity search', purpose: 'search' },
  { bot: 'Perplexity-User', company: 'Perplexity (when a user asks)', purpose: 'user' },
  { bot: 'Googlebot', company: 'Google Search & AI Overviews', purpose: 'search' },
  { bot: 'Google-Extended', company: 'Gemini training', purpose: 'training' },
  { bot: 'Bingbot', company: 'Bing & Copilot', purpose: 'search' },
  { bot: 'Applebot', company: 'Apple Siri & Spotlight', purpose: 'search' },
  { bot: 'Applebot-Extended', company: 'Apple AI training', purpose: 'training' },
  { bot: 'meta-externalagent', company: 'Meta AI', purpose: 'training' },
  { bot: 'CCBot', company: 'Common Crawl (used by many AI models)', purpose: 'training' },
];

export function levelFor(score: number) {
  return score >= 85 ? 'AI-ready' : score >= 70 ? 'Good' : score >= 40 ? 'Needs work' : 'Hard for AI to use';
}

type Probe = { llmsTxt: boolean; markdown: boolean; linkHeader: boolean; apiCatalog: boolean; mcpCard: boolean; agentSkills: boolean; oauthMeta: boolean };

async function probe(origin: string, ua: string): Promise<Probe> {
  const ok = async (path: string, test: (body: string, ct: string, h: Headers) => boolean) => {
    try {
      const res = await safeFetch(`${origin}${path}`, { userAgent: ua, maxBytes: 300_000, timeoutMs: 10_000 });
      return res.status === 200 && test(res.body, res.headers.get('content-type') ?? '', res.headers);
    } catch { return false; }
  };
  const markdown = await (async () => {
    try {
      const url = await assertPublicUrl(`${origin}/`);
      const res = await fetch(url, { headers: { accept: 'text/markdown', 'user-agent': ua }, signal: AbortSignal.timeout(10_000), redirect: 'manual' });
      await res.body?.cancel();
      return res.ok && (res.headers.get('content-type') ?? '').includes('markdown');
    } catch { return false; }
  })();
  const [llmsTxt, linkHeader, apiCatalog, mcpCard, agentSkills, oauthMeta] = await Promise.all([
    ok('/llms.txt', (b, ct) => !/<html/i.test(b) && b.trim().length > 20 && !ct.includes('html')),
    ok('/', (_b, _ct, h) => /rel="?(describedby|api-catalog|service-desc|sitemap)/i.test(h.get('link') ?? '')),
    ok('/.well-known/api-catalog', b => b.trim().startsWith('{')),
    ok('/.well-known/mcp/server-card.json', b => b.trim().startsWith('{')),
    ok('/.well-known/agent-skills/index.json', b => b.trim().startsWith('{') || b.trim().startsWith('[')),
    ok('/.well-known/oauth-authorization-server', b => b.includes('issuer')),
  ]);
  return { llmsTxt, markdown, linkHeader, apiCatalog, mcpCard, agentSkills, oauthMeta };
}

const share = (pages: PageData[], test: (p: PageData) => boolean) => (pages.length ? pages.filter(test).length / pages.length : 0);
const statusOf = (ratio: number): CheckStatus => (ratio >= 0.9 ? 'pass' : ratio >= 0.4 ? 'partial' : 'fail');

export function scoreAiReadiness(crawl: CrawlResult, p: Probe): AiReadiness {
  const origin = new URL(crawl.startUrl).origin;
  const home = crawl.startUrl;
  const robots = crawl.robotsTxt ? robotsParser(`${origin}/robots.txt`, crawl.robotsTxt) : null;
  const bots: BotAccess[] = AI_BOTS.map(b => ({ ...b, allowed: robots ? robots.isAllowed(home, b.bot) !== false : true }));
  const pages = crawl.pages.filter(x => x.isHtml && x.status >= 200 && x.status < 300 && !/noindex/.test(x.metaRobots + x.xRobotsTag));
  const homePage = pages.find(x => x.finalUrl === crawl.startUrl) ?? pages[0];
  const checks: AiCheck[] = [];
  const add = (c: Omit<AiCheck, 'earned'>, ratio = c.status === 'pass' ? 1 : c.status === 'partial' ? 0.5 : 0) => checks.push({ ...c, earned: Math.round(c.weight * ratio * 10) / 10 });

  // ---- Access ----
  const answerBots = bots.filter(b => b.purpose !== 'training');
  const blockedAnswer = answerBots.filter(b => !b.allowed);
  const answerRatio = (answerBots.length - blockedAnswer.length) / answerBots.length;
  add({
    id: 'ai-search-bots', group: 'Access', name: 'AI search assistants can visit your site', weight: 18, status: statusOf(answerRatio),
    detail: blockedAnswer.length ? `Blocked in robots.txt: ${blockedAnswer.map(b => b.bot).join(', ')}.` : 'ChatGPT, Claude, Perplexity, Google, Bing and Apple can all read your pages.',
    fix: blockedAnswer.length ? 'These bots fetch pages when someone asks an AI about you. Blocking them means you are left out of the answer. Allow them in robots.txt.' : undefined,
    snippet: blockedAnswer.length ? blockedAnswer.map(b => `User-agent: ${b.bot}\nAllow: /`).join('\n\n') : undefined,
  }, answerRatio);
  const training = bots.filter(b => b.purpose === 'training');
  add({
    id: 'ai-training-choice', group: 'Access', name: 'AI training preference is a deliberate choice', weight: 2,
    status: crawl.robotsTxt && training.some(b => crawl.robotsTxt!.toLowerCase().includes(b.bot.toLowerCase())) ? 'pass' : 'partial',
    detail: `${training.filter(b => b.allowed).length} of ${training.length} AI training crawlers are allowed.`,
    fix: 'Blocking training crawlers (GPTBot, ClaudeBot, Google-Extended) does not remove you from AI answers. Decide either way and write it in robots.txt so it is explicit.',
  });
  add({ id: 'robots', group: 'Access', name: 'robots.txt exists', weight: 3, status: crawl.robotsFound ? 'pass' : 'fail',
    detail: crawl.robotsFound ? 'Found.' : 'No robots.txt at the site root.', fix: crawl.robotsFound ? undefined : 'Add a robots.txt that allows crawlers and lists your sitemap.',
    snippet: crawl.robotsFound ? undefined : `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml` });
  add({ id: 'sitemap-xml', group: 'Access', name: 'Real XML sitemap', weight: 5, status: crawl.sitemapIsXml ? 'pass' : 'fail',
    detail: crawl.sitemapIsXml ? `${crawl.sitemapUrls.length} URLs listed.` : 'No valid XML sitemap found (an HTML page at /sitemap.xml does not count).',
    fix: crawl.sitemapIsXml ? undefined : 'Turn on the sitemap in your SEO plugin or CMS so crawlers get a full list of pages.' });
  add({ id: 'sitemap-in-robots', group: 'Access', name: 'Sitemap listed in robots.txt', weight: 2, status: crawl.sitemapInRobots ? 'pass' : 'fail',
    detail: crawl.sitemapInRobots ? 'Listed.' : 'robots.txt does not point to the sitemap.', snippet: crawl.sitemapInRobots ? undefined : `Sitemap: ${origin}/sitemap.xml` });
  const signals = /content-signal\s*:/i.test(crawl.robotsTxt ?? '');
  add({ id: 'content-signals', group: 'Access', name: 'Content usage signals declared', weight: 2, status: signals ? 'pass' : 'fail',
    detail: signals ? 'robots.txt states how AI may use your content.' : 'No Content-Signal line in robots.txt.',
    fix: signals ? undefined : 'Optional new standard: tell AI systems whether they may use your content for search, AI answers and training.',
    snippet: signals ? undefined : 'User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nAllow: /' });

  // ---- Readability ----
  const rendered = share(pages, x => x.wordCount >= 150);
  add({ id: 'html-content', group: 'Readability', name: 'Content readable without JavaScript', weight: 14, status: statusOf(rendered),
    detail: `${Math.round(rendered * 100)}% of pages have their text in the HTML. Most AI crawlers do not run JavaScript.`,
    fix: rendered < 0.9 ? 'Pages that build their text with JavaScript look empty to AI crawlers. Use server-side rendering or pre-rendering for those pages.' : undefined }, rendered);
  const types = new Set(pages.flatMap(x => x.jsonLdTypes ?? []));
  const hasOrg = [...types].some(t => /Organization|LocalBusiness|Store|Restaurant|Service|Corporation|Dentist|Attorney|Hotel|MedicalBusiness/i.test(t));
  const sdRatio = share(pages, x => (x.jsonLdTypes?.length ?? 0) > 0);
  add({ id: 'structured-data', group: 'Readability', name: 'Structured data (JSON-LD)', weight: 10, status: hasOrg && sdRatio >= 0.5 ? 'pass' : hasOrg || sdRatio > 0 ? 'partial' : 'fail',
    detail: types.size ? `Found: ${[...types].slice(0, 8).join(', ')}.` : 'No structured data found.',
    fix: hasOrg ? undefined : 'Add Organization or LocalBusiness structured data so AI knows exactly who you are. The AI Feed tab generates it from your Brand Memory.' });
  add({ id: 'llms-txt', group: 'Readability', name: 'llms.txt guide for AI', weight: 6, status: p.llmsTxt ? 'pass' : 'fail',
    detail: p.llmsTxt ? 'Found /llms.txt.' : 'No /llms.txt file.', fix: p.llmsTxt ? undefined : 'An llms.txt file gives AI a short summary of your business and your key pages. Generate one in the AI Feed tab.' });
  const answerFirst = share(pages, x => (x.firstParagraphWords ?? 0) > 0 && (x.firstParagraphWords ?? 0) <= 80 && (x.h2Count ?? 0) >= 2);
  add({ id: 'answer-first', group: 'Readability', name: 'Clear, answer-first structure', weight: 6, status: statusOf(answerFirst),
    detail: `${Math.round(answerFirst * 100)}% of pages open with a short summary paragraph and use subheadings.`,
    fix: answerFirst < 0.9 ? 'AI quotes short, self-contained passages. Start pages with a 1–3 sentence answer, then break the rest up with clear H2 subheadings.' : undefined }, answerFirst);
  const fresh = crawl.sitemapHasLastmod || share(pages, x => Boolean(x.hasModifiedDate)) >= 0.3;
  add({ id: 'freshness', group: 'Readability', name: 'Update dates visible to crawlers', weight: 3, status: fresh ? 'pass' : 'fail',
    detail: fresh ? 'Sitemap or pages carry last-modified dates.' : 'No last-modified dates in the sitemap or pages.',
    fix: fresh ? undefined : 'AI prefers current information. Make sure your sitemap includes <lastmod> dates (most SEO plugins do this).' });
  add({ id: 'markdown', group: 'Readability', name: 'Markdown version for AI agents', weight: 2, status: p.markdown ? 'pass' : 'fail',
    detail: p.markdown ? 'Returns Markdown when asked.' : 'Does not return Markdown for Accept: text/markdown.',
    fix: p.markdown ? undefined : 'Advanced: serving a plain Markdown version of pages makes them cheaper and more reliable for AI agents to read.' });

  // ---- Trust ----
  add({ id: 'identity', group: 'Trust', name: 'Business identity is clear', weight: 6,
    status: hasOrg && (homePage?.socialLinks?.length ?? 0) > 0 ? 'pass' : hasOrg || (homePage?.socialLinks?.length ?? 0) > 0 ? 'partial' : 'fail',
    detail: `${hasOrg ? 'Organization data found' : 'No Organization data'} · ${homePage?.socialLinks?.length ?? 0} social profile links on the home page.`,
    fix: 'AI cross-checks who you are. Add Organization data with your name, logo and links to your social profiles (sameAs).' });
  const hasAbout = pages.some(x => /about|over-ons|uber-uns|who-we-are|our-story/i.test(x.url + x.title));
  const hasContact = pages.some(x => /contact/i.test(x.url + x.title));
  add({ id: 'about-contact', group: 'Trust', name: 'About and Contact pages', weight: 4, status: hasAbout && hasContact ? 'pass' : hasAbout || hasContact ? 'partial' : 'fail',
    detail: `About page: ${hasAbout ? 'yes' : 'not found'} · Contact page: ${hasContact ? 'yes' : 'not found'}.`,
    fix: hasAbout && hasContact ? undefined : 'Pages that explain who you are and how to reach you make AI more confident recommending you.' });
  const phones = new Set(pages.flatMap(x => x.phones ?? []).map(n => n.replace(/^\+?0+/, '').slice(-9)));
  add({ id: 'consistent-contact', group: 'Trust', name: 'Consistent contact details', weight: 3, status: phones.size === 1 ? 'pass' : phones.size === 0 ? 'fail' : 'partial',
    detail: phones.size === 0 ? 'No clickable phone number found.' : phones.size === 1 ? 'One phone number used across the site.' : `${phones.size} different phone numbers across pages.`,
    fix: phones.size === 1 ? undefined : 'Use one clickable phone number (tel: link) everywhere so AI and maps show the right one.' });

  // ---- Agent standards (new; low weight, few sites have them yet) ----
  const std = [
    { id: 'link-headers', name: 'Link headers for agents', ok: p.linkHeader, fix: 'Send Link response headers pointing to your sitemap and API description.' },
    { id: 'api-catalog', name: 'API catalog (/.well-known/api-catalog)', ok: p.apiCatalog, fix: 'Only needed if you offer an API: publish /.well-known/api-catalog.' },
    { id: 'mcp-card', name: 'MCP server card', ok: p.mcpCard, fix: 'Only needed if you run an MCP server for AI agents: publish /.well-known/mcp/server-card.json.' },
    { id: 'agent-skills', name: 'Agent skills index', ok: p.agentSkills, fix: 'Advanced: publish /.well-known/agent-skills/index.json describing tasks agents can do on your site.' },
    { id: 'oauth-meta', name: 'OAuth metadata for agents', ok: p.oauthMeta, fix: 'Only needed if agents should log in to your service: publish OAuth authorization server metadata.' },
  ];
  for (const s of std) add({ id: s.id, group: 'Agent standards', name: s.name, weight: 2, status: s.ok ? 'pass' : 'fail', detail: s.ok ? 'Found.' : 'Not found (common: most sites don’t have this yet).', fix: s.ok ? undefined : s.fix });

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const score = Math.round((checks.reduce((a, c) => a + c.earned, 0) / total) * 100);
  return { score, level: levelFor(score), checks, bots, extras: { llmsTxt: p.llmsTxt, markdown: p.markdown } };
}

export async function runAiReadiness(crawl: CrawlResult, userAgent: string): Promise<AiReadiness> {
  const origin = new URL(crawl.startUrl).origin;
  return scoreAiReadiness(crawl, await probe(origin, userAgent));
}

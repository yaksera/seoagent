import { z } from 'zod';
import type { PageData } from './crawler';
import { callJson, escapeData } from './openrouter';

const field = z.object({ keep: z.boolean(), recommended: z.string(), alternative: z.string(), reason: z.string() });
const schema = z.object({ title: field, meta_description: field, h1: field, confidence: z.number().min(0).max(1) });
export type FixSuggestion = z.infer<typeof schema>;

const fieldJson = {
  type: 'object',
  additionalProperties: false,
  required: ['keep', 'recommended', 'alternative', 'reason'],
  properties: { keep: { type: 'boolean' }, recommended: { type: 'string' }, alternative: { type: 'string' }, reason: { type: 'string' } },
};
const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'meta_description', 'h1', 'confidence'],
  properties: { title: fieldJson, meta_description: fieldJson, h1: fieldJson, confidence: { type: 'number' } },
};

export type PageFix = FixSuggestion & { warnings: string[]; model: string; costUsd: number | null; createdAt: string };

const SYSTEM = `Write an SEO title, meta description and main heading (H1) for one web page.

Title: 30 to 60 characters. Main topic near the start. Add the brand at the end with " | " only if it fits and other pages on the site do this (see site_titles). Must describe the page accurately.
Meta description: 120 to 155 characters. Say what the visitor gets on this page and why it's worth clicking. A soft call to action only if the page supports it.
H1: 20 to 70 characters, one clear heading for the page. It can differ from the title.

If a current value already meets these rules and matches the page, set keep=true and repeat it as recommended.
Give one recommended option and one alternative per field, and a one-sentence reason in plain English.
Set confidence lower if the page content is thin or unclear.`;

// Model output is checked in code: lengths, duplicates and invented numbers.
function check(fix: FixSuggestion, page: PageData, otherTitles: Set<string>): string[] {
  const warnings: string[] = [];
  const t = fix.title.recommended, m = fix.meta_description.recommended, h = fix.h1.recommended;
  if (!fix.title.keep && (t.length < 30 || t.length > 60)) warnings.push(`Title is ${t.length} characters (aim for 30–60).`);
  if (!fix.meta_description.keep && (m.length < 120 || m.length > 160)) warnings.push(`Meta description is ${m.length} characters (aim for 120–155).`);
  if (!fix.h1.keep && (h.length < 10 || h.length > 80)) warnings.push(`H1 is ${h.length} characters.`);
  if (otherTitles.has(t.toLowerCase())) warnings.push('Suggested title is the same as another page on the site.');
  const source = `${page.title} ${page.metaDescription} ${page.text}`;
  const numbers = `${t} ${m} ${h}`.match(/\d[\d,.]*/g) ?? [];
  const invented = numbers.filter(n => !source.includes(n));
  if (invented.length) warnings.push(`Check these numbers, they don't appear on the page: ${invented.join(', ')}.`);
  if (fix.confidence < 0.6) warnings.push('Low confidence: the page has little content to work from.');
  return warnings;
}

export async function suggestFixes(page: PageData, allPages: PageData[], siteHost: string): Promise<PageFix> {
  const others = allPages.filter(p => p.url !== page.url && p.title);
  const user = `<site>${escapeData(siteHost)}</site>
<page>
url: ${escapeData(page.finalUrl)}
current_title: ${escapeData(page.title) || '(none)'}
current_meta_description: ${escapeData(page.metaDescription) || '(none)'}
current_h1: ${escapeData(page.h1.join(' | ')) || '(none)'}
headings: ${escapeData(page.headings.filter(x => x.level > 1).slice(0, 15).map(x => x.text).join(' | '))}
site_titles: ${escapeData(others.slice(0, 4).map(p => p.title).join(' || '))}
</page>
<page_content>
${escapeData(page.text.split(' ').slice(0, 900).join(' '))}
</page_content>`;

  const { data, model, costUsd } = await callJson({ name: 'title_meta_h1', system: SYSTEM, user, schema, jsonSchema, maxTokens: 700 });
  return { ...data, warnings: check(data, page, new Set(others.map(p => p.title.toLowerCase()))), model, costUsd, createdAt: new Date().toISOString() };
}

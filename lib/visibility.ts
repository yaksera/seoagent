import { and, desc, eq, sql } from 'drizzle-orm';
import type { Brand } from './brand';
import { getDb, schema } from './db';
import { enqueue } from './jobs';
import { callText } from './openrouter';

// AI visibility: ask web-connected AI models the questions customers ask, and record whether
// the business is mentioned in the answer or its site is cited as a source. API answers come
// close to, but are not identical to, what people see in the consumer apps.

export const MAX_PROMPTS = 10;

export const engines = () => (process.env.VISIBILITY_ENGINES || 'perplexity/sonar').split(',').map(s => s.trim()).filter(Boolean);

export const engineLabel = (model: string) => {
  const m = model.toLowerCase();
  if (m.includes('perplexity')) return 'Perplexity';
  if (m.includes('openai') || m.includes('gpt')) return 'ChatGPT';
  if (m.includes('anthropic') || m.includes('claude')) return 'Claude';
  if (m.includes('google') || m.includes('gemini')) return 'Gemini';
  if (m.includes('x-ai') || m.includes('grok')) return 'Grok';
  return model;
};

export function suggestPrompts(brand: Brand | null, host: string): string[] {
  const place = brand?.city || brand?.areaServed || '';
  const services = brand?.services?.length ? brand.services.slice(0, 3) : [brand?.schemaType?.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() || 'services'];
  const out = new Set<string>();
  for (const s of services) {
    out.add(place ? `Who is the best ${s.toLowerCase()} provider in ${place}?` : `What are the best companies for ${s.toLowerCase()}?`);
    if (place) out.add(`Recommend a reliable ${s.toLowerCase()} near ${place}`);
  }
  if (brand?.businessName) out.add(`Is ${brand.businessName} any good? What do they offer?`);
  else out.add(`What does ${host} do?`);
  return [...out].slice(0, 6);
}

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function detect(text: string, citations: string[], brandName: string, host: string) {
  const lower = text.toLowerCase();
  const names = [brandName, host, host.split('.')[0].length > 3 ? host.split('.')[0] : ''].map(n => n.trim().toLowerCase()).filter(n => n.length > 2);
  const idx = names.map(n => lower.indexOf(n)).filter(i => i >= 0).sort((a, b) => a - b)[0];
  const cited = citations.filter(c => { const h = hostOf(c); return h === host || h.endsWith(`.${host}`); });
  const mentioned = idx !== undefined || cited.length > 0;
  const start = Math.max(0, (idx ?? 0) - 120);
  return { mentioned, cited: cited.length > 0, citedUrls: cited, excerpt: text.slice(start, start + 420).trim() };
}

export async function runVisibilityCheck({ siteId }: { siteId: string }) {
  const db = await getDb();
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.id, siteId));
  if (!site || site.deletedAt) return;
  const prompts = await db.select().from(schema.visibilityPrompts).where(eq(schema.visibilityPrompts.siteId, siteId)).limit(MAX_PROMPTS);
  const [profile] = await db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.siteId, siteId));
  const brandName = (profile?.data as Brand | undefined)?.businessName ?? '';
  for (const p of prompts) {
    for (const model of engines()) {
      try {
        const r = await callText({ ctx: { feature: 'ai_visibility', accountId: site.accountId, siteId }, model, prompt: p.prompt });
        const d = detect(r.text, r.citations, brandName, site.host);
        await db.insert(schema.visibilityResults).values({ siteId, promptId: p.id, engine: engineLabel(model), ...d });
      } catch (e) {
        if (e instanceof Error && /budget/i.test(e.message)) return; // stop for this month
        console.error('[visibility]', model, e);
      }
    }
  }
}

export async function scheduleVisibilityChecks() {
  const db = await getDb();
  const due = await db.execute(sql`
    select distinct p.site_id from visibility_prompts p
    join sites s on s.id = p.site_id join accounts a on a.id = s.account_id
    where s.deleted_at is null and a.deleted_at is null and a.disabled_at is null
      and (a.plan = 'active' or (a.plan = 'trial' and a.trial_ends_at > now()))
      and not exists (select 1 from visibility_results r where r.site_id = p.site_id and r.created_at > now() - interval '7 days')
      and not exists (select 1 from jobs j where j.type = 'visibility' and j.status in ('queued','running') and j.payload->>'siteId' = p.site_id::text)
    limit 50`);
  for (const r of due.rows as { site_id: string }[]) await enqueue('visibility', { siteId: r.site_id });
}

export async function latestVisibility(siteId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.visibilityResults).where(eq(schema.visibilityResults.siteId, siteId)).orderBy(desc(schema.visibilityResults.createdAt)).limit(400);
  const latest = new Map<string, typeof rows[number]>();
  const previous = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    const k = `${r.promptId}:${r.engine}`;
    if (!latest.has(k)) latest.set(k, r);
    else if (!previous.has(k)) previous.set(k, r);
  }
  const rate = (m: Map<string, typeof rows[number]>) => (m.size ? Math.round(([...m.values()].filter(r => r.mentioned).length / m.size) * 100) : null);
  return { latest, previousRate: rate(previous), rate: rate(latest), citedRate: latest.size ? Math.round(([...latest.values()].filter(r => r.cited).length / latest.size) * 100) : null };
}

export async function runningVisibility(siteId: string) {
  const db = await getDb();
  const [j] = await db.select({ id: schema.jobs.id }).from(schema.jobs)
    .where(and(eq(schema.jobs.type, 'visibility'), sql`${schema.jobs.status} in ('queued','running')`, sql`${schema.jobs.payload}->>'siteId' = ${siteId}`));
  return Boolean(j);
}

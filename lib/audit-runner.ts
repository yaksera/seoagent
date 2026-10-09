import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { crawlSite } from './crawler';
import { getDb, schema } from './db';
import { enqueue } from './jobs';
import { runAudit } from './rules';

const userAgent = () => process.env.CRAWLER_USER_AGENT || 'SEOAgentBot/1.0';

export async function createAudit(input: { url: string; trigger: 'free' | 'manual' | 'scheduled'; maxPages: number; accountId?: string; siteId?: string; ip?: string }) {
  const db = await getDb();
  const [audit] = await db.insert(schema.audits).values({ ...input, status: 'queued' }).returning({ id: schema.audits.id });
  await enqueue('audit', { auditId: audit.id });
  return audit.id;
}

export async function runAuditJob({ auditId }: { auditId: string }) {
  const db = await getDb();
  const [audit] = await db.select().from(schema.audits).where(eq(schema.audits.id, auditId));
  if (!audit || audit.status === 'done') return;
  const started = Date.now();
  await db.update(schema.audits).set({ status: 'running', startedAt: new Date(), error: null }).where(eq(schema.audits.id, auditId));
  try {
    const crawl = await crawlSite(audit.url, { maxPages: audit.maxPages, userAgent: userAgent() });
    const { issues, score } = runAudit(crawl);
    await db.update(schema.audits).set({
      status: 'done', crawl, issues, score, pagesCount: crawl.pages.length, finishedAt: new Date(), durationMs: Date.now() - started,
    }).where(eq(schema.audits.id, auditId));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Crawl failed';
    await db.update(schema.audits).set({ status: 'failed', error: message, finishedAt: new Date(), durationMs: Date.now() - started }).where(eq(schema.audits.id, auditId));
    // Bad URLs and blocked addresses won't succeed on retry; network errors might.
    if (/not allowed|valid URL|resolve|credentials/i.test(message)) return;
    throw e;
  }
}

// Weekly crawl for every site on an active account that hasn't been audited in 7 days.
export async function scheduleWeeklyAudits() {
  const db = await getDb();
  const due = await db.execute(sql`
    select s.id, s.url, s.account_id, a.plan from sites s
    join accounts a on a.id = s.account_id
    where s.deleted_at is null and a.deleted_at is null and a.disabled_at is null
      and coalesce((s.settings->>'weeklyCrawl')::boolean, true)
      and (a.plan = 'active' or (a.plan = 'trial' and a.trial_ends_at > now()))
      and not exists (
        select 1 from audits x where x.site_id = s.id
          and (x.status in ('queued', 'running') or x.created_at > now() - interval '7 days'))
    limit 100`);
  for (const row of due.rows as { id: string; url: string; account_id: string; plan: string }[]) {
    await createAudit({ url: row.url, trigger: 'scheduled', maxPages: row.plan === 'active' ? 500 : 100, accountId: row.account_id, siteId: row.id });
  }
  return due.rows.length;
}

export async function latestAudits(siteIds: string[]) {
  if (!siteIds.length) return new Map<string, typeof schema.audits.$inferSelect>();
  const db = await getDb();
  const rows = await db.select().from(schema.audits)
    .where(and(inArray(schema.audits.siteId, siteIds), eq(schema.audits.status, 'done')))
    .orderBy(desc(schema.audits.createdAt));
  const map = new Map<string, typeof rows[number]>();
  for (const r of rows) if (r.siteId && !map.has(r.siteId)) map.set(r.siteId, r);
  return map;
}

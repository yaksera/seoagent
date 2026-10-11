import { beforeAll, describe, expect, it } from 'vitest';

// Real Postgres (PGlite in memory) with the real migrations.
process.env.PGLITE_DIR = 'memory://';

let db: Awaited<ReturnType<typeof import('./db').getDb>>;
let schema: typeof import('./db').schema;
let siteId: string;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const mod = await import('./db');
  db = await mod.getDb();
  schema = mod.schema;
  const [account] = await db.insert(schema.accounts).values({ name: 'Test' }).returning();
  const [site] = await db.insert(schema.sites).values({ accountId: account.id, url: 'https://a.com/', host: 'a.com', verificationToken: 'x' }).returning();
  siteId = site.id;
}, 60_000);

describe('Search Console insights', () => {
  it('computes totals, top queries and almost-ranking queries', async () => {
    await db.insert(schema.gscRows).values([
      { siteId, date: daysAgo(3), page: 'https://a.com/plumber', query: 'plumber kathmandu', clicks: 10, impressions: 100, position: 4 },
      { siteId, date: daysAgo(4), page: 'https://a.com/plumber', query: 'emergency plumber', clicks: 1, impressions: 80, position: 12 },
      { siteId, date: daysAgo(5), page: 'https://a.com/', query: 'emergency plumber', clicks: 0, impressions: 20, position: 14 },
      { siteId, date: daysAgo(40), page: 'https://a.com/', query: 'plumber kathmandu', clicks: 5, impressions: 50, position: 6 },
    ]);
    const { searchTotals, topQueries, almostRanking } = await import('./google-insights');
    const totals = await searchTotals(siteId);
    expect(totals.clicks).toBe(11);
    expect(totals.impressions).toBe(200);
    expect(totals.prev_clicks).toBe(5);
    expect(totals.position).toBeCloseTo((4 * 100 + 12 * 80 + 14 * 20) / 200, 2);

    const top = await topQueries(siteId);
    expect(top[0].query).toBe('plumber kathmandu');

    const almost = await almostRanking(siteId);
    expect(almost).toHaveLength(1);
    expect(almost[0]).toMatchObject({ query: 'emergency plumber', impressions: 100, page: 'https://a.com/plumber' });
  });
});

describe('job queue', () => {
  it('claims each job once, retries failures, then gives up', async () => {
    const { enqueue, claimJob, failJob, finishJob } = await import('./jobs');
    await enqueue('test', { n: 1 });
    const job = await claimJob();
    expect(job?.type).toBe('test');
    expect(await claimJob()).toBeNull(); // already running

    expect(await failJob(job!, 'boom')).toBe(false); // attempt 1 → retry later
    await db.execute((await import('drizzle-orm')).sql`update jobs set run_at = now() where id = ${job!.id}`);
    const again = await claimJob();
    expect(again?.attempts).toBe(2);
    await finishJob(again!.id);
    expect(await claimJob()).toBeNull();
  });
});

describe('notifications and maintenance', () => {
  it('alerts on a score drop once, sends the monthly report once, and runs cleanup', async () => {
    const { sql } = await import('drizzle-orm');
    const [site] = await db.select().from(schema.sites);
    await db.insert(schema.users).values({ accountId: site.accountId, email: 'owner@a.com', passwordHash: 'x' });
    await db.update(schema.sites).set({ createdAt: new Date(Date.now() - 90 * 86_400_000) });
    await db.update(schema.accounts).set({ trialEndsAt: new Date(Date.now() + 86_400_000) });
    const base = { accountId: site.accountId, siteId: site.id, url: site.url, trigger: 'manual' as const, maxPages: 10, status: 'done' as const };
    const lastMonth = new Date(); lastMonth.setUTCDate(1); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1); lastMonth.setUTCDate(10);
    await db.insert(schema.audits).values({ ...base, score: 90, issues: [], createdAt: lastMonth });
    const [bad] = await db.insert(schema.audits).values({
      ...base, score: 70, issues: [{ id: 'noindex', name: 'Noindex', severity: 'critical', findings: [{ url: site.url }], why: 'x' }],
    }).returning();

    const { auditAlerts, monthlyReports, trialReminders } = await import('./notifications');
    await auditAlerts(bad.id);
    await auditAlerts(bad.id);
    await monthlyReports();
    await monthlyReports();
    await trialReminders();
    const sent = await db.select({ type: schema.notifications.type }).from(schema.notifications);
    expect(sent.map(s => s.type).sort()).toEqual(['alert', 'report', 'trial']);

    const { runMaintenance } = await import('./maintenance');
    await db.update(schema.accounts).set({ deletedAt: new Date(Date.now() - 31 * 86_400_000) });
    await runMaintenance();
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from accounts`)).rows as { n: number }[];
    expect(n).toBe(0);
  });
});

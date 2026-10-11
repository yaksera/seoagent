import { and, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Stat, Table } from '@/components/admin';
import { ActionButton } from '@/components/action-button';
import { btnCls, btnSecondaryCls } from '@/components/ui';
import { logAction, requireUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { googleConfigured } from '@/lib/google';
import { almostRanking, searchTotals, topQueries } from '@/lib/google-insights';

export const dynamic = 'force-dynamic';

const pct = (now: number, prev: number) => (prev ? `${now >= prev ? '+' : ''}${Math.round(((now - prev) / prev) * 100)}% vs previous 28 days` : 'no earlier data');
const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };

export default async function GooglePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { id } = await params;
  const { connected, error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await requireUser();
  const db = await getDb();
  const [site] = await db.select().from(schema.sites).where(and(eq(schema.sites.id, id), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (!site) notFound();
  const [g] = await db.select().from(schema.integrations).where(and(eq(schema.integrations.siteId, id), eq(schema.integrations.provider, 'google')));
  const meta = (g?.meta ?? {}) as { property?: string; lastSyncAt?: string };

  async function disconnect() {
    'use server';
    const u = await requireUser();
    const d = await getDb();
    await d.delete(schema.integrations).where(and(eq(schema.integrations.siteId, id), eq(schema.integrations.accountId, u.account.id), eq(schema.integrations.provider, 'google')));
    await d.delete(schema.gscRows).where(eq(schema.gscRows.siteId, id));
    await logAction('google_disconnected', { accountId: u.account.id, userId: u.user.id, target: id });
    return { ok: 'Disconnected and search data deleted.' };
  }

  const header = (
    <div>
      <Link href={`/app/sites/${id}`} className="text-sm text-muted hover:text-ink">← {site.host}</Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Google Search Console</h1>
      {error && <p role="alert" className="mt-4 rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">{error}</p>}
      {connected && <p role="status" className="mt-4 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">Connected. The first sync takes a minute or two.</p>}
    </div>
  );

  if (!g) {
    return (
      <div className="max-w-2xl space-y-6">
        {header}
        <p className="text-muted">See the searches that bring people to {site.host}, how often you appear, and which keywords are close to page one. We only ask for read-only access.</p>
        {googleConfigured()
          ? <a href={`/api/google/start?siteId=${id}`} className={btnCls}>Connect Google</a>
          : <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">Google sign-in isn&apos;t set up on this server yet (missing GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>}
      </div>
    );
  }

  const [totals, top, almost] = await Promise.all([searchTotals(id), topQueries(id), almostRanking(id)]);

  return (
    <div className="space-y-8">
      {header}
      <p className="text-sm text-muted">Property {meta.property} · last sync {meta.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString('en-GB') : 'running…'}{g.status === 'error' && <span className="text-critical"> · {g.lastError}</span>}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Clicks (28 days)" value={totals.clicks.toLocaleString('en-GB')} note={pct(totals.clicks, totals.prev_clicks)} />
        <Stat label="Impressions (28 days)" value={totals.impressions.toLocaleString('en-GB')} note={pct(totals.impressions, totals.prev_impressions)} />
        <Stat label="Average position" value={totals.position ? totals.position.toFixed(1) : '–'} note="lower is better" />
      </div>
      <section>
        <h2 className="font-semibold">Almost on page one</h2>
        <p className="mb-3 text-sm text-muted">Searches where you average position 8–20. Improving these pages is usually the fastest way to more visitors.</p>
        <Table head={['Search', 'Page', 'Impressions', 'Clicks', 'Position']} empty={almost.length === 0}>
          {almost.map(r => <tr key={r.query}><td>{r.query}</td><td className="max-w-56 truncate">{pathOf(r.page)}</td><td>{r.impressions}</td><td>{r.clicks}</td><td className="font-mono">{r.position.toFixed(1)}</td></tr>)}
        </Table>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Top searches</h2>
        <Table head={['Search', 'Page', 'Clicks', 'Impressions', 'Position']} empty={top.length === 0}>
          {top.map(r => <tr key={r.query}><td>{r.query}</td><td className="max-w-56 truncate">{pathOf(r.page)}</td><td>{r.clicks}</td><td>{r.impressions}</td><td className="font-mono">{r.position.toFixed(1)}</td></tr>)}
        </Table>
      </section>
      <div className="flex gap-3">
        <a href={`/api/google/start?siteId=${id}`} className={btnSecondaryCls}>Reconnect</a>
        <ActionButton action={disconnect} label="Disconnect" className={btnSecondaryCls} confirm="Disconnect Google and delete the stored search data?" />
      </div>
    </div>
  );
}

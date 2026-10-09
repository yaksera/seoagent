import { and, desc, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/action-button';
import { btnSecondaryCls } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { deleteSite, runAuditNow, updateSiteSettings } from '../../actions';

export const dynamic = 'force-dynamic';

const scoreColour = (s: number) => (s >= 80 ? 'text-accent' : s >= 50 ? 'text-warning' : 'text-critical');
const STATUS: Record<string, string> = { queued: 'Waiting', running: 'Running', done: 'Done', failed: 'Failed' };

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await requireUser();
  const db = await getDb();
  const [site] = await db.select().from(schema.sites)
    .where(and(eq(schema.sites.id, id), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (!site) notFound();

  const audits = await db.select({
    id: schema.audits.id, status: schema.audits.status, score: schema.audits.score, pagesCount: schema.audits.pagesCount,
    trigger: schema.audits.trigger, createdAt: schema.audits.createdAt, error: schema.audits.error,
  }).from(schema.audits).where(eq(schema.audits.siteId, site.id)).orderBy(desc(schema.audits.createdAt)).limit(20);
  const integrations = await db.select({ provider: schema.integrations.provider, status: schema.integrations.status, meta: schema.integrations.meta })
    .from(schema.integrations).where(eq(schema.integrations.siteId, site.id));
  const wp = integrations.find(i => i.provider === 'wordpress');
  const google = integrations.find(i => i.provider === 'google');
  const latestDone = audits.find(a => a.status === 'done');

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/app" className="text-sm text-muted hover:text-ink">← All sites</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{site.host}</h1>
          <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-sm text-muted underline">{site.url}</a>
        </div>
        <div className="flex items-end gap-6">
          {latestDone?.score != null && (
            <Link href={`/app/audits/${latestDone.id}`} className="text-right">
              <span className="block text-sm text-muted">Latest score</span>
              <span className={`font-mono text-5xl ${scoreColour(latestDone.score)}`}>{latestDone.score}</span>
            </Link>
          )}
          <ActionButton action={runAuditNow.bind(null, site.id)} label="Run audit now" pending="Starting…" />
        </div>
      </div>

      <section aria-labelledby="history">
        <h2 id="history" className="text-lg font-semibold">Audit history</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-muted"><tr className="border-b border-line"><th className="py-2 font-normal">Date</th><th className="font-normal">Type</th><th className="font-normal">Pages</th><th className="font-normal">Score</th><th className="font-normal">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {audits.map(a => (
                <tr key={a.id}>
                  <td className="py-2"><Link href={`/app/audits/${a.id}`} className="underline">{a.createdAt.toLocaleString('en-GB')}</Link></td>
                  <td className="capitalize">{a.trigger}</td>
                  <td className="font-mono">{a.pagesCount ?? '–'}</td>
                  <td className={`font-mono ${a.score != null ? scoreColour(a.score) : ''}`}>{a.score ?? '–'}</td>
                  <td title={a.error ?? undefined}>{STATUS[a.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="connections" className="grid gap-4 sm:grid-cols-2">
        <h2 id="connections" className="text-lg font-semibold sm:col-span-2">Connections</h2>
        <div className="rounded-md border border-line bg-white p-4">
          <h3 className="font-medium">WordPress</h3>
          <p className="mt-1 text-sm text-muted">{wp ? `Connected${wp.status === 'error' ? ' (needs attention)' : ''}. Fixes can be published with one click and rolled back.` : 'Connect to publish fixes straight to your site.'}</p>
          <Link href={`/app/sites/${site.id}/wordpress`} className={`${btnSecondaryCls} mt-3`}>{wp ? 'Manage' : 'Connect WordPress'}</Link>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <h3 className="font-medium">Google Search Console</h3>
          <p className="mt-1 text-sm text-muted">{google ? 'Connected. Clicks, impressions and queries update daily.' : 'See which searches bring visitors and which keywords are close to page one.'}</p>
          <Link href={`/app/sites/${site.id}/google`} className={`${btnSecondaryCls} mt-3`}>{google ? 'View search data' : 'Connect Google'}</Link>
        </div>
      </section>

      <section aria-labelledby="settings" className="grid gap-6 sm:grid-cols-2">
        <form action={updateSiteSettings.bind(null, site.id)} className="space-y-3 rounded-md border border-line bg-white p-4">
          <h2 id="settings" className="font-semibold">Settings</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="weeklyCrawl" defaultChecked={site.settings.weeklyCrawl !== false} /> Audit automatically every week</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reportEmails" defaultChecked={site.settings.reportEmails !== false} /> Email me the monthly report and alerts</label>
          <button className={btnSecondaryCls}>Save settings</button>
        </form>
        <div className="rounded-md border border-critical/30 p-4">
          <h2 className="font-semibold">Remove site</h2>
          <p className="mb-3 mt-1 text-sm text-muted">Stops audits and disconnects integrations. Changes already published to your site stay.</p>
          <ActionButton action={async () => { 'use server'; await deleteSite(site.id); return undefined; }} label="Remove this site" pending="Removing…" className={`${btnSecondaryCls} text-critical`} confirm={`Remove ${site.host}?`} />
        </div>
      </section>
    </div>
  );
}

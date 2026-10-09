import { and, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { AuthForm } from '@/components/ui';
import { latestAudits } from '@/lib/audit-runner';
import { requireUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { siteLimit } from '@/lib/plans';
import { addSite } from './actions';

const scoreColour = (s: number) => (s >= 80 ? 'text-accent' : s >= 50 ? 'text-warning' : 'text-critical');

export default async function Dashboard() {
  const s = await requireUser();
  const db = await getDb();
  const sites = await db.select().from(schema.sites)
    .where(and(eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)))
    .orderBy(schema.sites.createdAt);
  const latest = await latestAudits(sites.map(x => x.id));
  const slots = siteLimit(s.account);

  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <section aria-labelledby="sites">
        <h1 id="sites" className="text-2xl font-semibold tracking-tight">Your sites</h1>
        <p className="mt-1 text-sm text-muted">{sites.length} of {slots} site{slots === 1 ? '' : 's'} used</p>
        {sites.length === 0 && <p className="mt-6 text-muted">Add your first website to run a full audit.</p>}
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {sites.map(site => {
            const a = latest.get(site.id);
            return (
              <li key={site.id}>
                <Link href={`/app/sites/${site.id}`} className="flex items-center justify-between gap-4 py-4 hover:bg-white">
                  <span>
                    <span className="font-medium">{site.host}</span>
                    <span className="block text-sm text-muted">{a ? `Last audit ${a.createdAt.toLocaleDateString('en-GB')} · ${a.pagesCount} pages` : 'First audit running…'}</span>
                  </span>
                  {a?.score != null && <span className={`font-mono text-3xl ${scoreColour(a.score)}`}>{a.score}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-labelledby="add" className="rounded-md border border-line bg-white p-5 self-start">
        <h2 id="add" className="font-semibold">Add a website</h2>
        <p className="mb-4 mt-1 text-sm text-muted">We audit it right away, then every week.</p>
        <AuthForm action={addSite} submit="Add site" pending="Adding…" fields={[{ name: 'url', label: 'Website address', autoComplete: 'url' }]} />
      </section>
    </div>
  );
}

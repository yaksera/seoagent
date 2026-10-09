import { desc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Stat, Table, usd, when } from '@/components/admin';
import { btnSecondaryCls } from '@/components/ui';
import { getDb, schema } from '@/lib/db';
import { planLabel } from '@/lib/plans';
import { extendTrial, impersonate, setDisabled } from '../../actions';

export default async function AdminAccount({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, id));
  if (!account) notFound();
  const users = await db.select().from(schema.users).where(eq(schema.users.accountId, id));
  const sites = await db.select().from(schema.sites).where(eq(schema.sites.accountId, id));
  const audits = await db.select({ id: schema.audits.id, url: schema.audits.url, status: schema.audits.status, score: schema.audits.score, trigger: schema.audits.trigger, error: schema.audits.error, createdAt: schema.audits.createdAt })
    .from(schema.audits).where(eq(schema.audits.accountId, id)).orderBy(desc(schema.audits.createdAt)).limit(15);
  const [cost] = (await db.execute(sql`select coalesce(sum(cost_usd), 0)::float as total,
    coalesce(sum(cost_usd) filter (where created_at > date_trunc('month', now())), 0)::float as month, count(*)::int as calls
    from llm_calls where account_id = ${id}`)).rows as { total: number; month: number; calls: number }[];
  const log = await db.select().from(schema.auditLog).where(eq(schema.auditLog.accountId, id)).orderBy(desc(schema.auditLog.createdAt)).limit(20);
  const owner = users[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/accounts" className="text-sm text-muted hover:text-ink">← Accounts</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{account.name}</h1>
          <p className="text-sm text-muted">{planLabel(account)} · created {when(account.createdAt)}{account.stripeCustomerId && ` · Stripe ${account.stripeCustomerId}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {owner && !account.deletedAt && <form action={impersonate.bind(null, owner.id)}><button className={btnSecondaryCls}>View as user</button></form>}
          <form action={extendTrial.bind(null, id, 7)}><button className={btnSecondaryCls}>Extend trial 7 days</button></form>
          <form action={setDisabled.bind(null, id, !account.disabledAt)}><button className={`${btnSecondaryCls} ${account.disabledAt ? '' : 'text-critical'}`}>{account.disabledAt ? 'Enable account' : 'Disable account'}</button></form>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Sites" value={sites.filter(s => !s.deletedAt).length} note={`${account.siteQuantity} paid slots`} />
        <Stat label="AI cost this month" value={usd(cost.month)} />
        <Stat label="AI cost total" value={usd(cost.total)} note={`${cost.calls} calls`} />
        <Stat label="Status" value={<span className="text-xl">{account.deletedAt ? 'Deleted' : account.disabledAt ? 'Disabled' : 'OK'}</span>} />
      </div>

      <section><h2 className="mb-3 font-semibold">Users</h2>
        <Table head={['Email', 'Name', 'Verified', 'Last login', 'Created']}>
          {users.map(u => <tr key={u.id}><td>{u.email}{u.isAdmin && ' (admin)'}</td><td>{u.name}</td><td>{u.emailVerifiedAt ? 'Yes' : 'No'}</td><td>{when(u.lastLoginAt)}</td><td>{when(u.createdAt)}</td></tr>)}
        </Table>
      </section>
      <section><h2 className="mb-3 font-semibold">Sites</h2>
        <Table head={['Host', 'Weekly audit', 'Added', 'Status']} empty={sites.length === 0}>
          {sites.map(s => <tr key={s.id}><td>{s.host}</td><td>{s.settings.weeklyCrawl === false ? 'Off' : 'On'}</td><td>{when(s.createdAt)}</td><td>{s.deletedAt ? 'Removed' : 'Active'}</td></tr>)}
        </Table>
      </section>
      <section><h2 className="mb-3 font-semibold">Recent audits</h2>
        <Table head={['When', 'URL', 'Type', 'Score', 'Status']} empty={audits.length === 0}>
          {audits.map(a => <tr key={a.id}><td>{when(a.createdAt)}</td><td className="break-all">{a.url}</td><td>{a.trigger}</td><td className="font-mono">{a.score ?? '–'}</td><td title={a.error ?? ''} className={a.status === 'failed' ? 'text-critical' : ''}>{a.status}</td></tr>)}
        </Table>
      </section>
      <section><h2 className="mb-3 font-semibold">Activity</h2>
        <Table head={['When', 'Action', 'Target', 'IP']} empty={log.length === 0}>
          {log.map(l => <tr key={l.id}><td>{when(l.createdAt)}</td><td>{l.action}</td><td className="break-all">{l.target}</td><td className="font-mono text-xs">{l.ip}</td></tr>)}
        </Table>
      </section>
    </div>
  );
}

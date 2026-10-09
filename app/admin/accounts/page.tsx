import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { Table, usd, when } from '@/components/admin';
import { getDb } from '@/lib/db';

type Row = { id: string; name: string; email: string; plan: string; sites: number; audits: number; ai_cost: number; created_at: Date; disabled_at: Date | null; deleted_at: Date | null; trial_ends_at: Date | null };

export default async function AdminAccounts({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string }> }) {
  const { q = '', plan = '' } = await searchParams;
  const db = await getDb();
  const like = `%${q.trim().toLowerCase()}%`;
  const rows = (await db.execute(sql`
    select a.id, a.name, a.plan, a.created_at, a.disabled_at, a.deleted_at, a.trial_ends_at,
      (select string_agg(email, ', ') from users u where u.account_id = a.id) as email,
      (select count(*) from sites s where s.account_id = a.id and s.deleted_at is null)::int as sites,
      (select count(*) from audits x where x.account_id = a.id)::int as audits,
      (select coalesce(sum(cost_usd), 0) from llm_calls l where l.account_id = a.id)::float as ai_cost
    from accounts a
    where (${q} = '' or lower(a.name) like ${like} or exists (select 1 from users u where u.account_id = a.id and u.email like ${like})
           or exists (select 1 from sites s where s.account_id = a.id and s.host like ${like}))
      and (${plan} = '' or a.plan = ${plan})
    order by a.created_at desc limit 200`)).rows as Row[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, email or site" className="min-h-10 w-72 rounded-md border border-line bg-white px-3" />
        <select name="plan" defaultValue={plan} className="min-h-10 rounded-md border border-line bg-white px-2">
          <option value="">All plans</option><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="canceled">Canceled</option>
        </select>
        <button className="min-h-10 rounded-md bg-ink px-4 text-white">Filter</button>
      </form>
      <Table head={['Account', 'Plan', 'Sites', 'Audits', 'AI cost', 'Created']} empty={rows.length === 0}>
        {rows.map(r => (
          <tr key={r.id}>
            <td><Link href={`/admin/accounts/${r.id}`} className="font-medium underline">{r.name}</Link><span className="block text-xs text-muted">{r.email}</span></td>
            <td>{r.deleted_at ? <span className="text-muted">deleted</span> : r.disabled_at ? <span className="text-critical">disabled</span> : r.plan}</td>
            <td>{r.sites}</td><td>{r.audits}</td><td>{usd(r.ai_cost)}</td><td>{when(r.created_at)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

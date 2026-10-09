import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { Stat, Table, usd } from '@/components/admin';
import { getDb } from '@/lib/db';
import { PRICE_PER_SITE_USD } from '@/lib/plans';

type Num = Record<string, number>;

export default async function AdminOverview() {
  const db = await getDb();
  const [m] = (await db.execute(sql`
    select
      (select count(*) from accounts where deleted_at is null)::int as accounts,
      (select count(*) from accounts where plan = 'active' and deleted_at is null)::int as paying,
      (select count(*) from accounts where plan = 'trial' and trial_ends_at > now() and deleted_at is null)::int as trials,
      (select count(*) from accounts where plan = 'past_due')::int as past_due,
      (select coalesce(sum(site_quantity), 0) from accounts where plan = 'active' and deleted_at is null)::int as paid_sites,
      (select count(*) from sites where deleted_at is null)::int as sites,
      (select count(*) from users where created_at > now() - interval '7 days')::int as signups_7d,
      (select count(*) from audits where created_at > now() - interval '7 days')::int as audits_7d,
      (select count(*) from audits where status = 'failed' and created_at > now() - interval '7 days')::int as audits_failed_7d,
      (select count(*) from audits where trigger = 'free' and created_at > now() - interval '7 days')::int as free_audits_7d,
      (select coalesce(sum(cost_usd), 0) from llm_calls where created_at > now() - interval '30 days')::float as ai_cost_30d,
      (select count(*) from llm_calls where ok = false and created_at > now() - interval '7 days')::int as ai_errors_7d,
      (select count(*) from jobs where status = 'failed')::int as failed_jobs,
      (select count(*) from jobs where status = 'queued' and run_at <= now())::int as queue
  `)).rows as Num[];

  const days = (await db.execute(sql`
    select to_char(d, 'YYYY-MM-DD') as day,
      (select count(*) from users where created_at::date = d)::int as signups,
      (select count(*) from audits where created_at::date = d)::int as audits,
      (select coalesce(sum(cost_usd), 0) from llm_calls where created_at::date = d)::float as ai_cost
    from generate_series(current_date - 13, current_date, interval '1 day') as d order by d desc
  `)).rows as { day: string; signups: number; audits: number; ai_cost: number }[];

  const mrr = m.paid_sites * PRICE_PER_SITE_USD;
  const costPerSite = m.sites ? m.ai_cost_30d / m.sites : 0;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR" value={`$${mrr.toLocaleString('en-US')}`} note={`${m.paid_sites} paid sites × $${PRICE_PER_SITE_USD}`} />
        <Stat label="Paying accounts" value={m.paying} note={`${m.trials} on trial · ${m.past_due} payment failed`} />
        <Stat label="Sites" value={m.sites} note={`${m.accounts} accounts`} />
        <Stat label="Sign-ups (7 days)" value={m.signups_7d} />
        <Stat label="Audits (7 days)" value={m.audits_7d} note={`${m.free_audits_7d} free · ${m.audits_failed_7d} failed`} />
        <Stat label="AI cost (30 days)" value={usd(m.ai_cost_30d)} note={`${usd(costPerSite)} per site · ${m.ai_errors_7d} errors this week`} />
        <Stat label="Job queue" value={m.queue} note="waiting to run now" />
        <Link href="/admin/jobs"><Stat label="Failed jobs" value={<span className={m.failed_jobs ? 'text-critical' : ''}>{m.failed_jobs}</span>} note="click to review" /></Link>
      </div>
      <section>
        <h2 className="mb-3 font-semibold">Last 14 days</h2>
        <Table head={['Day', 'Sign-ups', 'Audits', 'AI cost']}>
          {days.map(d => <tr key={d.day}><td className="font-mono">{d.day}</td><td>{d.signups}</td><td>{d.audits}</td><td>{usd(d.ai_cost)}</td></tr>)}
        </Table>
      </section>
    </div>
  );
}

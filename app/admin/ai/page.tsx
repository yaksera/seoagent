import { desc, eq, sql } from 'drizzle-orm';
import { Table, usd, when } from '@/components/admin';
import { getDb, schema } from '@/lib/db';

export default async function AdminAi() {
  const db = await getDb();
  const byModel = (await db.execute(sql`
    select coalesce(model, '(failed)') as model, count(*)::int as calls, coalesce(sum(cost_usd), 0)::float as cost,
      coalesce(avg(latency_ms), 0)::int as latency, (count(*) filter (where not ok))::int as errors
    from llm_calls where created_at > now() - interval '30 days' group by 1 order by cost desc`)).rows as { model: string; calls: number; cost: number; latency: number; errors: number }[];
  const recent = await db.select({ call: schema.llmCalls, account: schema.accounts.name }).from(schema.llmCalls)
    .leftJoin(schema.accounts, eq(schema.accounts.id, schema.llmCalls.accountId))
    .orderBy(desc(schema.llmCalls.createdAt)).limit(100);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">AI usage</h1>
      <section>
        <h2 className="mb-3 font-semibold">By model, last 30 days</h2>
        <Table head={['Model', 'Calls', 'Cost', 'Avg latency', 'Errors']} empty={byModel.length === 0}>
          {byModel.map(m => <tr key={m.model}><td className="font-mono text-xs">{m.model}</td><td>{m.calls}</td><td>{usd(m.cost)}</td><td>{(m.latency / 1000).toFixed(1)}s</td><td className={m.errors ? 'text-critical' : ''}>{m.errors}</td></tr>)}
        </Table>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Recent calls</h2>
        <Table head={['When', 'Account', 'Feature', 'Model', 'Cost', 'Latency', 'Result']} empty={recent.length === 0}>
          {recent.map(({ call: c, account }) => (
            <tr key={c.id}>
              <td>{when(c.createdAt)}</td><td>{account ?? '–'}</td><td>{c.feature}</td><td className="font-mono text-xs">{c.model ?? '–'}</td>
              <td>{usd(c.costUsd)}</td><td>{c.latencyMs ? `${(c.latencyMs / 1000).toFixed(1)}s` : '–'}</td>
              <td className={c.ok ? 'text-accent' : 'text-critical'} title={c.error ?? ''}>{c.ok ? 'OK' : 'Error'}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}

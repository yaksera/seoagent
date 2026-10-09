import { desc, eq, sql } from 'drizzle-orm';
import { Table, when } from '@/components/admin';
import { getDb, schema } from '@/lib/db';

export default async function AdminAudits({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = '' } = await searchParams;
  const db = await getDb();
  const rows = await db.select({
    id: schema.audits.id, url: schema.audits.url, status: schema.audits.status, trigger: schema.audits.trigger, score: schema.audits.score,
    pages: schema.audits.pagesCount, ms: schema.audits.durationMs, error: schema.audits.error, ip: schema.audits.ip, createdAt: schema.audits.createdAt, account: schema.accounts.name,
  }).from(schema.audits).leftJoin(schema.accounts, eq(schema.accounts.id, schema.audits.accountId))
    .where(status ? sql`${schema.audits.status} = ${status}` : undefined)
    .orderBy(desc(schema.audits.createdAt)).limit(200);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Audits</h1>
      <form className="flex gap-2">
        <select name="status" defaultValue={status} className="min-h-10 rounded-md border border-line bg-white px-2">
          <option value="">All</option><option value="queued">Queued</option><option value="running">Running</option><option value="done">Done</option><option value="failed">Failed</option>
        </select>
        <button className="min-h-10 rounded-md bg-ink px-4 text-white">Filter</button>
      </form>
      <Table head={['When', 'URL', 'Account', 'Type', 'Pages', 'Time', 'Score', 'Status']} empty={rows.length === 0}>
        {rows.map(r => (
          <tr key={r.id}>
            <td>{when(r.createdAt)}</td><td className="max-w-64 break-all">{r.url}</td><td>{r.account ?? <span className="text-muted">free · {r.ip}</span>}</td>
            <td>{r.trigger}</td><td>{r.pages ?? '–'}</td><td>{r.ms ? `${Math.round(r.ms / 1000)}s` : '–'}</td><td className="font-mono">{r.score ?? '–'}</td>
            <td className={r.status === 'failed' ? 'text-critical' : ''} title={r.error ?? ''}>{r.status}{r.error && <span className="block max-w-56 truncate text-xs">{r.error}</span>}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

import { desc, eq, like } from 'drizzle-orm';
import { Table, when } from '@/components/admin';
import { getDb, schema } from '@/lib/db';

export default async function AdminLog({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const { action = '' } = await searchParams;
  const db = await getDb();
  const rows = await db.select({ log: schema.auditLog, email: schema.users.email }).from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .where(action ? like(schema.auditLog.action, `${action}%`) : undefined)
    .orderBy(desc(schema.auditLog.createdAt)).limit(300);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
      <form className="flex gap-2">
        <input name="action" defaultValue={action} placeholder="Filter by action, e.g. login or admin_" className="min-h-10 w-72 rounded-md border border-line bg-white px-3" />
        <button className="min-h-10 rounded-md bg-ink px-4 text-white">Filter</button>
      </form>
      <Table head={['When', 'Action', 'User', 'Target', 'IP']} empty={rows.length === 0}>
        {rows.map(({ log: l, email }) => (
          <tr key={l.id}>
            <td>{when(l.createdAt)}</td>
            <td className={l.action.startsWith('admin_') ? 'text-warning' : l.action.includes('failed') ? 'text-critical' : ''}>{l.action}</td>
            <td>{email ?? '–'}</td><td className="max-w-64 break-all">{l.target}</td><td className="font-mono text-xs">{l.ip}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

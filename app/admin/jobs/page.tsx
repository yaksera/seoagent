import { desc, inArray } from 'drizzle-orm';
import { Table, when } from '@/components/admin';
import { getDb, schema } from '@/lib/db';
import { retryJob } from '../actions';

export default async function AdminJobs() {
  const db = await getDb();
  const rows = await db.select().from(schema.jobs)
    .where(inArray(schema.jobs.status, ['failed', 'running', 'queued']))
    .orderBy(desc(schema.jobs.createdAt)).limit(200);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
      <p className="text-sm text-muted">Background work: audits, syncs, reports. Failed jobs were retried 3 times before stopping.</p>
      <Table head={['Created', 'Type', 'Status', 'Attempts', 'Payload', 'Error', '']} empty={rows.length === 0}>
        {rows.map(j => (
          <tr key={j.id}>
            <td>{when(j.createdAt)}</td><td>{j.type}</td>
            <td className={j.status === 'failed' ? 'text-critical' : ''}>{j.status}</td><td>{j.attempts}</td>
            <td className="max-w-48 truncate font-mono text-xs">{JSON.stringify(j.payload)}</td>
            <td className="max-w-72"><details><summary className="cursor-pointer truncate text-xs">{j.lastError?.split('\n')[0] ?? '–'}</summary><pre className="mt-2 whitespace-pre-wrap text-xs">{j.lastError}</pre></details></td>
            <td>{j.status === 'failed' && <form action={retryJob.bind(null, j.id)}><button className="underline">Retry</button></form>}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

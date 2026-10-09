import { sql } from 'drizzle-orm';
import { getDb, schema } from './db';

// Postgres-backed job queue. Jobs are claimed with FOR UPDATE SKIP LOCKED, so several
// app instances can run workers safely. Handlers are registered in lib/worker.ts.
export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

export async function enqueue(type: string, payload: Record<string, unknown>, runAt = new Date()) {
  const db = await getDb();
  await db.insert(schema.jobs).values({ type, payload, runAt });
}

type JobRow = { id: string; type: string; payload: Record<string, unknown>; attempts: number };

export async function claimJob(): Promise<JobRow | null> {
  const db = await getDb();
  const res = await db.execute(sql`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
    where id = (
      select id from jobs where status = 'queued' and run_at <= now()
      order by run_at limit 1 for update skip locked
    )
    returning id, type, payload, attempts`);
  return (res.rows[0] as JobRow | undefined) ?? null;
}

export async function finishJob(id: string) {
  const db = await getDb();
  await db.execute(sql`update jobs set status = 'done', locked_at = null where id = ${id}`);
}

const MAX_ATTEMPTS = 3;

export async function failJob(job: JobRow, error: string) {
  const db = await getDb();
  const final = job.attempts >= MAX_ATTEMPTS;
  // Retry after 1, 4, 9 minutes.
  await db.execute(sql`
    update jobs set status = ${final ? 'failed' : 'queued'}, locked_at = null, last_error = ${error.slice(0, 2000)},
      run_at = now() + make_interval(mins => ${job.attempts * job.attempts})
    where id = ${job.id}`);
  return final;
}

// Jobs left "running" by a crashed process go back to the queue.
export async function recoverStaleJobs() {
  const db = await getDb();
  await db.execute(sql`update jobs set status = 'queued', locked_at = null where status = 'running' and locked_at < now() - interval '20 minutes'`);
}

export async function retryJob(id: string) {
  const db = await getDb();
  await db.execute(sql`update jobs set status = 'queued', attempts = 0, run_at = now(), last_error = null where id = ${id} and status = 'failed'`);
}

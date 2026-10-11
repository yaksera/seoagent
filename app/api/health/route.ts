import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// For uptime monitors and the hosting platform's health check.
export async function GET() {
  try {
    const db = await getDb();
    const res = await db.execute(sql`select
      (select count(*) from jobs where status = 'queued' and run_at < now() - interval '15 minutes')::int as stuck_jobs`);
    const { stuck_jobs } = res.rows[0] as { stuck_jobs: number };
    return Response.json({ ok: true, db: 'up', stuckJobs: stuck_jobs }, { status: stuck_jobs > 50 ? 503 : 200 });
  } catch {
    return Response.json({ ok: false, db: 'down' }, { status: 503 });
  }
}

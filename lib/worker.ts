import { runAuditJob, scheduleWeeklyAudits } from './audit-runner';
import { claimJob, failJob, finishJob, recoverStaleJobs, type JobHandler } from './jobs';

// Handlers for each job type. Later phases register more here.
const handlers: Record<string, JobHandler> = {
  audit: p => runAuditJob(p as { auditId: string }),
};

export function registerHandler(type: string, handler: JobHandler) {
  handlers[type] = handler;
}

type Scheduled = { everyMs: number; run: () => Promise<unknown>; last?: number };
const scheduled: Record<string, Scheduled> = {
  weeklyAudits: { everyMs: 15 * 60_000, run: scheduleWeeklyAudits },
  recoverStale: { everyMs: 5 * 60_000, run: recoverStaleJobs },
};

export function registerSchedule(name: string, everyMs: number, run: () => Promise<unknown>) {
  scheduled[name] = { everyMs, run };
}

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 2;
let running = 0;

async function tick() {
  while (running < CONCURRENCY) {
    const job = await claimJob();
    if (!job) break;
    running++;
    const handler = handlers[job.type];
    (async () => {
      try {
        if (!handler) throw new Error(`No handler for job type "${job.type}"`);
        await handler(job.payload);
        await finishJob(job.id);
      } catch (e) {
        const final = await failJob(job, e instanceof Error ? e.stack ?? e.message : String(e));
        console.error(`[worker] job ${job.type} ${job.id} failed${final ? ' permanently' : ', will retry'}:`, e);
      } finally {
        running--;
      }
    })();
  }
  const now = Date.now();
  for (const [name, s] of Object.entries(scheduled)) {
    if (s.last && now - s.last < s.everyMs) continue;
    s.last = now;
    s.run().catch(e => console.error(`[scheduler] ${name} failed:`, e));
  }
}

// Runs inside the Next.js server process (see instrumentation.ts). Set WORKER_ENABLED=false
// on web-only instances if you later split workers onto their own machines.
const g = globalThis as unknown as { __workerStarted?: boolean };
export function startWorker() {
  if (g.__workerStarted || process.env.WORKER_ENABLED === 'false') return;
  g.__workerStarted = true;
  setInterval(() => { tick().catch(e => console.error('[worker] tick failed:', e)); }, 2000);
  console.info(`[worker] started (concurrency ${CONCURRENCY})`);
}

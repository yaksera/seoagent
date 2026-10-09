import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createAudit } from '@/lib/audit-runner';
import { getDb, schema } from '@/lib/db';
import { LIMITS } from '@/lib/plans';
import { assertPublicUrl } from '@/lib/safe-fetch';

export const runtime = 'nodejs';

const body = z.object({ url: z.string().trim().min(3).max(2048) });

// Free audit from the home page: 20 pages, 5 per IP per hour, no account needed.
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a website address.' }, { status: 400 });

  const db = await getDb();
  const [recent] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.audits)
    .where(and(eq(schema.audits.ip, ip), eq(schema.audits.trigger, 'free'), gt(schema.audits.createdAt, sql`now() - interval '1 hour'`)));
  if ((recent?.n ?? 0) >= 5) return Response.json({ error: 'Too many free audits from your network. Try again in an hour, or start a free trial.' }, { status: 429 });

  const raw = /^https?:\/\//i.test(parsed.data.url) ? parsed.data.url : `https://${parsed.data.url}`;
  try {
    await assertPublicUrl(raw);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Invalid address.' }, { status: 422 });
  }
  const id = await createAudit({ url: raw, trigger: 'free', maxPages: LIMITS.freeAuditPages, ip });
  return Response.json({ id });
}

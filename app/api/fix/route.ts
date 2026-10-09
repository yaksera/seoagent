import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import type { CrawlResult } from '@/lib/crawler';
import { getDb, schema } from '@/lib/db';
import { suggestFixes } from '@/lib/fixes';
import { isActive } from '@/lib/plans';

export const runtime = 'nodejs';
export const maxDuration = 90;

const body = z.object({ auditId: z.string().uuid(), url: z.string().url() });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: 'Log in to get fixes.' }, { status: 401 });
  if (!isActive(session.account)) return Response.json({ error: 'Your trial has ended. Choose a plan in Billing to keep getting fixes.' }, { status: 402 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });

  const db = await getDb();
  // Scoped to the user's account: another account's audit id returns 404.
  const [audit] = await db.select().from(schema.audits)
    .where(and(eq(schema.audits.id, parsed.data.auditId), eq(schema.audits.accountId, session.account.id)));
  if (!audit || audit.status !== 'done') return Response.json({ error: 'Audit not found.' }, { status: 404 });

  const crawl = audit.crawl as CrawlResult;
  const page = crawl.pages.find(p => p.url === parsed.data.url && p.isHtml && p.status < 300);
  if (!page) return Response.json({ error: 'Page not found in this audit.' }, { status: 404 });

  const [cached] = await db.select().from(schema.fixes).where(and(eq(schema.fixes.auditId, audit.id), eq(schema.fixes.pageUrl, page.url)));
  if (cached) return Response.json({ ...(cached.suggestion as object), fixId: cached.id, status: cached.status });

  try {
    const fix = await suggestFixes(page, crawl.pages, crawl.host, { accountId: session.account.id, siteId: audit.siteId });
    const [row] = await db.insert(schema.fixes)
      .values({ auditId: audit.id, accountId: session.account.id, siteId: audit.siteId, pageUrl: page.url, suggestion: fix })
      .onConflictDoNothing().returning();
    return Response.json({ ...fix, fixId: row?.id, status: 'suggested' });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'AI request failed.' }, { status: 502 });
  }
}

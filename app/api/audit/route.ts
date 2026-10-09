import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { crawlSite } from '@/lib/crawler';
import { runAudit } from '@/lib/rules';
import { saveAudit } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 300;

const body = z.object({ url: z.string().trim().min(3).max(2048) });

// Simple per-IP limit for the MVP; replace with Redis when deployed on several instances.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 10 * 60_000);
  hits.set(ip, [...recent, now]);
  return recent.length >= 5;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (limited(ip)) return Response.json({ error: 'Too many audits. Try again in a few minutes.' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a website address.' }, { status: 400 });

  const started = Date.now();
  try {
    const crawl = await crawlSite(parsed.data.url, {
      maxPages: Math.min(Number(process.env.MAX_PAGES) || 50, 200),
      userAgent: process.env.CRAWLER_USER_AGENT || 'SEOAgentBot/0.1',
    });
    const { issues, score } = runAudit(crawl);
    const id = randomUUID();
    await saveAudit({ id, createdAt: new Date().toISOString(), durationMs: Date.now() - started, score, issues, crawl, fixes: {} });
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'The crawl failed.' }, { status: 422 });
  }
}

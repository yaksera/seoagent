import { z } from 'zod';
import { suggestFixes } from '@/lib/fixes';
import { loadAudit, saveAudit } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 90;

const body = z.object({ auditId: z.string().uuid(), url: z.string().url() });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });

  const audit = await loadAudit(parsed.data.auditId);
  if (!audit) return Response.json({ error: 'Audit not found.' }, { status: 404 });
  // Only pages from this audit can be sent to the AI.
  const page = audit.crawl.pages.find(p => p.url === parsed.data.url && p.isHtml && p.status < 300);
  if (!page) return Response.json({ error: 'Page not found in this audit.' }, { status: 404 });

  const cached = audit.fixes[page.url];
  if (cached) return Response.json(cached);

  try {
    const fix = await suggestFixes(page, audit.crawl.pages, audit.crawl.host);
    audit.fixes[page.url] = fix;
    await saveAudit(audit);
    return Response.json(fix);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'AI request failed.' }, { status: 502 });
  }
}

import { z } from 'zod';
import { getSession, logAction } from '@/lib/auth';
import { isActive } from '@/lib/plans';
import { publishFix, rollbackFix } from '@/lib/wordpress';

export const runtime = 'nodejs';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish'), fixId: z.string().uuid(), title: z.string().max(200).optional(), description: z.string().max(400).optional() }),
  z.object({ action: z.literal('rollback'), fixId: z.string().uuid() }),
]);

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return Response.json({ error: 'Log in first.' }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    if (parsed.data.action === 'publish') {
      if (!isActive(s.account)) return Response.json({ error: 'Your trial has ended. Choose a plan in Billing.' }, { status: 402 });
      if (!parsed.data.title && !parsed.data.description) return Response.json({ error: 'Nothing to publish.' }, { status: 400 });
      await publishFix(parsed.data.fixId, s.account.id, { title: parsed.data.title, description: parsed.data.description });
      await logAction('fix_published', { accountId: s.account.id, userId: s.user.id, target: parsed.data.fixId });
      return Response.json({ status: 'applied' });
    }
    await rollbackFix(parsed.data.fixId, s.account.id);
    await logAction('fix_rolled_back', { accountId: s.account.id, userId: s.user.id, target: parsed.data.fixId });
    return Response.json({ status: 'rolled_back' });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 502 });
  }
}

'use server';

import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/app/(auth)/actions';
import { logAction, requireUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { enqueue } from '@/lib/jobs';
import { isActive } from '@/lib/plans';
import { MAX_PROMPTS, runningVisibility } from '@/lib/visibility';

async function owned(siteId: string) {
  const s = await requireUser();
  const db = await getDb();
  const [site] = await db.select().from(schema.sites).where(and(eq(schema.sites.id, siteId), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  return { s, db, site };
}

export async function addPrompts(siteId: string, _: FormState, form: FormData): Promise<FormState> {
  const { s, db, site } = await owned(siteId);
  if (!site) return { error: 'Site not found.' };
  const wanted = String(form.get('prompts') ?? '').split(/\r?\n/).map(x => x.trim()).filter(x => x.length >= 8).map(x => x.slice(0, 200));
  if (!wanted.length) return { error: 'Write at least one question (8+ characters).' };
  const [{ n }] = await db.select({ n: count() }).from(schema.visibilityPrompts).where(eq(schema.visibilityPrompts.siteId, siteId));
  const room = MAX_PROMPTS - n;
  if (room <= 0) return { error: `You are tracking the maximum of ${MAX_PROMPTS} questions. Remove one first.` };
  await db.insert(schema.visibilityPrompts).values(wanted.slice(0, room).map(prompt => ({ siteId, accountId: s.account.id, prompt })));
  revalidatePath(`/app/sites/${siteId}/visibility`);
  return { ok: wanted.length > room ? `Added ${room}. The limit is ${MAX_PROMPTS} questions.` : 'Added.' };
}

export async function removePrompt(siteId: string, promptId: string) {
  const { s, db, site } = await owned(siteId);
  if (!site) return;
  await db.delete(schema.visibilityPrompts).where(and(eq(schema.visibilityPrompts.id, promptId), eq(schema.visibilityPrompts.accountId, s.account.id)));
  revalidatePath(`/app/sites/${siteId}/visibility`);
}

export async function runNow(siteId: string): Promise<FormState> {
  const { s, db, site } = await owned(siteId);
  if (!site) return { error: 'Site not found.' };
  if (!isActive(s.account)) return { error: 'Your trial has ended. Choose a plan in Billing.' };
  if (!process.env.OPENROUTER_API_KEY) return { error: 'AI is not set up on this server yet (missing OPENROUTER_API_KEY).' };
  const [{ n }] = await db.select({ n: count() }).from(schema.visibilityPrompts).where(eq(schema.visibilityPrompts.siteId, siteId));
  if (!n) return { error: 'Add at least one question first.' };
  if (await runningVisibility(siteId)) return { error: 'A check is already running.' };
  const [{ recent }] = await db.select({ recent: count() }).from(schema.visibilityResults)
    .where(and(eq(schema.visibilityResults.siteId, siteId), gt(schema.visibilityResults.createdAt, sql`now() - interval '20 hours'`)));
  if (recent > 0) return { error: 'You can run a manual check once a day. Checks also run automatically every week.' };
  await enqueue('visibility', { siteId });
  await logAction('visibility_run', { accountId: s.account.id, userId: s.user.id, target: site.host });
  revalidatePath(`/app/sites/${siteId}/visibility`);
  return { ok: 'Checking now. Results appear here in a minute or two.' };
}

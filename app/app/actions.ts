'use server';

import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/app/(auth)/actions';
import { createAudit } from '@/lib/audit-runner';
import { clientInfo, hashPassword, logAction, requireUser, verifyPassword } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { isActive, LIMITS, pageLimit, siteLimit } from '@/lib/plans';
import { assertPublicUrl } from '@/lib/safe-fetch';

async function ownedSite(siteId: string, accountId: string) {
  const db = await getDb();
  const [site] = await db.select().from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.accountId, accountId), isNull(schema.sites.deletedAt)));
  return site ?? null;
}

export async function addSite(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireUser();
  if (!isActive(s.account)) return { error: 'Your trial has ended. Choose a plan in Billing to add sites.' };
  const raw = String(form.get('url') ?? '').trim();
  if (!raw) return { error: 'Enter a website address.' };
  let url: URL;
  try {
    url = await assertPublicUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid address.' };
  }
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.sites)
    .where(and(eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (n >= siteLimit(s.account)) {
    return { error: s.account.plan === 'active' ? 'You have used all your site slots. Add another site in Billing ($49/month).' : 'The trial includes 1 site. Choose a plan in Billing to add more.' };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const [dupe] = await db.select({ id: schema.sites.id }).from(schema.sites)
    .where(and(eq(schema.sites.accountId, s.account.id), eq(schema.sites.host, host), isNull(schema.sites.deletedAt)));
  if (dupe) return { error: 'This site is already in your account.' };

  const [site] = await db.insert(schema.sites).values({
    accountId: s.account.id, url: `${url.protocol}//${url.host}/`, host, verificationToken: randomBytes(12).toString('hex'), settings: { weeklyCrawl: true, reportEmails: true },
  }).returning();
  await logAction('site_added', { accountId: s.account.id, userId: s.user.id, target: host });
  await createAudit({ url: site.url, trigger: 'manual', maxPages: pageLimit(s.account), accountId: s.account.id, siteId: site.id });
  redirect(`/app/sites/${site.id}`);
}

export async function runAuditNow(siteId: string, _state?: FormState, _form?: FormData): Promise<FormState> {
  const s = await requireUser();
  const site = await ownedSite(siteId, s.account.id);
  if (!site) return { error: 'Site not found.' };
  if (!isActive(s.account)) return { error: 'Your trial has ended. Choose a plan in Billing.' };
  const db = await getDb();
  const [{ n, running }] = await db.select({
    n: sql<number>`count(*) filter (where ${schema.audits.trigger} = 'manual')::int`,
    running: sql<number>`count(*) filter (where ${schema.audits.status} in ('queued','running'))::int`,
  }).from(schema.audits).where(and(eq(schema.audits.siteId, siteId), gt(schema.audits.createdAt, sql`now() - interval '1 day'`)));
  if (running > 0) return { error: 'An audit is already running for this site.' };
  if (n >= LIMITS.manualAuditsPerSitePerDay) return { error: `You can run ${LIMITS.manualAuditsPerSitePerDay} manual audits per site per day. Weekly audits run automatically.` };
  const id = await createAudit({ url: site.url, trigger: 'manual', maxPages: pageLimit(s.account), accountId: s.account.id, siteId });
  redirect(`/app/audits/${id}`);
}

export async function updateSiteSettings(siteId: string, form: FormData) {
  const s = await requireUser();
  const site = await ownedSite(siteId, s.account.id);
  if (!site) return;
  const db = await getDb();
  await db.update(schema.sites).set({ settings: { weeklyCrawl: form.get('weeklyCrawl') === 'on', reportEmails: form.get('reportEmails') === 'on' } }).where(eq(schema.sites.id, siteId));
  revalidatePath(`/app/sites/${siteId}`);
}

export async function deleteSite(siteId: string) {
  const s = await requireUser();
  const site = await ownedSite(siteId, s.account.id);
  if (!site) return;
  const db = await getDb();
  await db.update(schema.sites).set({ deletedAt: new Date() }).where(eq(schema.sites.id, siteId));
  await db.delete(schema.integrations).where(eq(schema.integrations.siteId, siteId));
  await logAction('site_deleted', { accountId: s.account.id, userId: s.user.id, target: site.host });
  redirect('/app');
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireUser();
  const parsed = z.object({ current: z.string().min(1), next: z.string().min(10, 'Use at least 10 characters').max(200) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await verifyPassword(parsed.data.current, s.user.passwordHash))) return { error: 'Current password is incorrect.' };
  const db = await getDb();
  await db.update(schema.users).set({ passwordHash: await hashPassword(parsed.data.next) }).where(eq(schema.users.id, s.user.id));
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, s.user.id), sql`${schema.sessions.id} <> ${s.session.id}`));
  await logAction('password_changed', { accountId: s.account.id, userId: s.user.id, ip: (await clientInfo()).ip });
  return { ok: 'Password changed. Other devices were logged out.' };
}

// Soft delete now; the nightly job removes the data after 30 days (see lib/maintenance.ts).
export async function deleteAccount(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireUser();
  if (form.get('confirm') !== s.user.email) return { error: 'Type your email address exactly to confirm.' };
  const db = await getDb();
  await db.update(schema.accounts).set({ deletedAt: new Date() }).where(eq(schema.accounts.id, s.account.id));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, s.user.id));
  await logAction('account_deleted', { accountId: s.account.id, userId: s.user.id });
  redirect('/?deleted=1');
}

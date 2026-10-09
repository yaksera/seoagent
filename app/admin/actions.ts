'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { endImpersonation, getSession, logAction, requireAdmin, startImpersonation } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { retryJob as retry } from '@/lib/jobs';

export async function impersonate(userId: string) {
  const admin = await requireAdmin();
  await logAction('admin_impersonate', { userId: admin.user.id, target: userId });
  await startImpersonation(userId, admin.user.id);
  redirect('/app');
}

export async function stopImpersonating() {
  const s = await getSession();
  if (s?.impersonating) await logAction('admin_impersonate_end', { userId: s.session.impersonatorId, target: s.user.id });
  await endImpersonation();
  redirect('/admin');
}

export async function setDisabled(accountId: string, disabled: boolean) {
  const admin = await requireAdmin();
  const db = await getDb();
  await db.update(schema.accounts).set({ disabledAt: disabled ? new Date() : null }).where(eq(schema.accounts.id, accountId));
  if (disabled) {
    await db.execute(sql`delete from sessions where user_id in (select id from users where account_id = ${accountId})`);
  }
  await logAction(disabled ? 'admin_disable_account' : 'admin_enable_account', { userId: admin.user.id, accountId, target: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
}

export async function extendTrial(accountId: string, days: number) {
  const admin = await requireAdmin();
  const db = await getDb();
  await db.execute(sql`update accounts set plan = case when plan = 'canceled' then 'trial' else plan end,
    trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => ${days}) where id = ${accountId}`);
  await logAction('admin_extend_trial', { userId: admin.user.id, accountId, meta: { days } });
  revalidatePath(`/admin/accounts/${accountId}`);
}

export async function retryJob(jobId: string) {
  const admin = await requireAdmin();
  await retry(jobId);
  await logAction('admin_retry_job', { userId: admin.user.id, target: jobId });
  revalidatePath('/admin/jobs');
}

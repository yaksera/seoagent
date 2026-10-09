'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/app/(auth)/actions';
import { logAction, requireUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { encryptCreds, testConnection } from '@/lib/wordpress';

const input = z.object({
  username: z.string().trim().min(1, 'Enter your WordPress username').max(100),
  appPassword: z.string().trim().min(16, 'Paste the Application Password from your WordPress profile').max(100),
  key: z.string().trim().min(20, 'Paste the connection key from Settings → SEO Agent').max(200),
});

export async function connectWordPress(siteId: string, _: FormState, form: FormData): Promise<FormState> {
  const s = await requireUser();
  const parsed = input.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  const [site] = await db.select().from(schema.sites).where(and(eq(schema.sites.id, siteId), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (!site) return { error: 'Site not found.' };
  if (!site.url.startsWith('https://')) return { error: 'Your site must use HTTPS so the password is sent securely.' };

  const creds = { siteUrl: site.url, ...parsed.data };
  let info;
  try {
    info = await testConnection(creds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not reach WordPress.' };
  }
  const homeHost = new URL(info.home).hostname.replace(/^www\./, '');
  if (homeHost !== site.host) return { error: `That WordPress install is ${homeHost}, not ${site.host}.` };

  const values = { accountId: s.account.id, siteId, provider: 'wordpress' as const, status: 'connected' as const, credentials: encryptCreds(creds), meta: info, lastError: null };
  await db.insert(schema.integrations).values(values).onConflictDoUpdate({ target: [schema.integrations.siteId, schema.integrations.provider], set: values });
  // Admin credentials for the site prove ownership.
  await db.update(schema.sites).set({ verifiedAt: new Date() }).where(eq(schema.sites.id, siteId));
  await logAction('wordpress_connected', { accountId: s.account.id, userId: s.user.id, target: site.host, meta: { provider: info.provider } });
  redirect(`/app/sites/${siteId}/wordpress?connected=1`);
}

export async function disconnectWordPress(siteId: string) {
  const s = await requireUser();
  const db = await getDb();
  await db.delete(schema.integrations).where(and(eq(schema.integrations.siteId, siteId), eq(schema.integrations.accountId, s.account.id), eq(schema.integrations.provider, 'wordpress')));
  await logAction('wordpress_disconnected', { accountId: s.account.id, userId: s.user.id, target: siteId });
  revalidatePath(`/app/sites/${siteId}`);
  redirect(`/app/sites/${siteId}`);
}

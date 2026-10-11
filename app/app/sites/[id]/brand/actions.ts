'use server';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/app/(auth)/actions';
import { logAction, requireUser } from '@/lib/auth';
import { type Brand, buildJsonLd, buildLlmsTxt, parseBrandForm } from '@/lib/brand';
import type { CrawlResult } from '@/lib/crawler';
import { getDb, schema } from '@/lib/db';
import { isActive } from '@/lib/plans';
import { publishFeed, rollbackFeed } from '@/lib/wordpress';

async function ownedSite(siteId: string) {
  const s = await requireUser();
  const db = await getDb();
  const [site] = await db.select().from(schema.sites).where(and(eq(schema.sites.id, siteId), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  return { s, db, site };
}

export async function saveBrand(siteId: string, _: FormState, form: FormData): Promise<FormState> {
  const { s, db, site } = await ownedSite(siteId);
  if (!site) return { error: 'Site not found.' };
  const { data, error } = parseBrandForm(form);
  if (!data) return { error };
  await db.insert(schema.brandProfiles).values({ siteId, accountId: s.account.id, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.brandProfiles.siteId, set: { data, updatedAt: new Date() } });
  await logAction('brand_saved', { accountId: s.account.id, userId: s.user.id, target: site.host });
  revalidatePath(`/app/sites/${siteId}/brand`);
  return { ok: 'Saved. Your AI feed below is updated.' };
}

export async function publishFeedAction(siteId: string): Promise<FormState> {
  const { s, db, site } = await ownedSite(siteId);
  if (!site) return { error: 'Site not found.' };
  if (!isActive(s.account)) return { error: 'Your trial has ended. Choose a plan in Billing.' };
  const [profile] = await db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.siteId, siteId));
  if (!profile) return { error: 'Save your Brand Memory first.' };
  const [audit] = await db.select({ crawl: schema.audits.crawl }).from(schema.audits)
    .where(and(eq(schema.audits.siteId, siteId), eq(schema.audits.status, 'done'))).orderBy(desc(schema.audits.createdAt)).limit(1);
  const brand = profile.data as Brand;
  try {
    await publishFeed(siteId, s.account.id, { llms_txt: buildLlmsTxt(brand, (audit?.crawl as CrawlResult) ?? null), json_ld: JSON.stringify(buildJsonLd(brand, site.url)) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Publishing failed.' };
  }
  await logAction('feed_published', { accountId: s.account.id, userId: s.user.id, target: site.host });
  revalidatePath(`/app/sites/${siteId}/brand`);
  return { ok: `Published. Check ${site.url}llms.txt — the next audit will pick it up.` };
}

export async function rollbackFeedAction(siteId: string): Promise<FormState> {
  const { s, site } = await ownedSite(siteId);
  if (!site) return { error: 'Site not found.' };
  try {
    await rollbackFeed(siteId, s.account.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Rollback failed.' };
  }
  await logAction('feed_rolled_back', { accountId: s.account.id, userId: s.user.id, target: site.host });
  revalidatePath(`/app/sites/${siteId}/brand`);
  return { ok: 'Rolled back to what was there before.' };
}

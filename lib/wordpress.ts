import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { decrypt, encrypt } from './crypto';
import { getDb, schema } from './db';
import { assertPublicUrl } from './safe-fetch';

export type WpCreds = { siteUrl: string; username: string; appPassword: string; key: string };
type SeoValues = { title: string; description: string };

class WpError extends Error {
  constructor(message: string, public status: number, public code?: string, public data?: unknown) { super(message); }
}

// Signed request to the connector plugin. Tries /wp-json first, then ?rest_route= for sites without pretty permalinks.
async function wpCall<T>(creds: WpCreds, route: string, body: Record<string, unknown>): Promise<T> {
  const json = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', creds.key).update(`${timestamp}.${json}`).digest('hex');
  const base = creds.siteUrl.replace(/\/$/, '');
  const headers = {
    'content-type': 'application/json',
    authorization: `Basic ${Buffer.from(`${creds.username}:${creds.appPassword.replace(/\s+/g, '')}`).toString('base64')}`,
    'x-seo-agent-timestamp': timestamp,
    'x-seo-agent-signature': signature,
    'user-agent': 'SEOAgent-Connector/1.0',
  };
  for (const url of [`${base}/wp-json/seo-agent/v1${route}`, `${base}/?rest_route=/seo-agent/v1${route}`]) {
    await assertPublicUrl(url);
    const res = await fetch(url, { method: 'POST', headers, body: json, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    const data = await res.json().catch(() => null);
    if (res.status === 404 && (!data || data.code === 'rest_no_route')) continue;
    if (!res.ok) {
      const msg = data?.code === 'rest_not_logged_in' || res.status === 401 ? 'WordPress rejected the username or Application Password.'
        : data?.code === 'seo_agent_signature' ? 'The connection key is wrong. Copy it again from Settings → SEO Agent.'
        : data?.message ?? `WordPress returned ${res.status}`;
      throw new WpError(msg, res.status, data?.code, data?.data);
    }
    return data as T;
  }
  throw new WpError('The SEO Agent Connector plugin was not found. Install and activate it first.', 404, 'no_plugin');
}

export async function testConnection(creds: WpCreds) {
  return wpCall<{ plugin: string; wordpress: string; provider: string; home: string }>(creds, '/info', {});
}

export async function getCreds(siteId: string, accountId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.integrations)
    .where(and(eq(schema.integrations.siteId, siteId), eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, 'wordpress')));
  return row ? { row, creds: JSON.parse(decrypt(row.credentials)) as WpCreds } : null;
}

export const encryptCreds = (c: WpCreds) => encrypt(JSON.stringify(c));

// Publish title/description for one page. Stores what was there before so it can be rolled back.
export async function publishFix(fixId: string, accountId: string, fields: { title?: string; description?: string }) {
  const db = await getDb();
  const [fix] = await db.select().from(schema.fixes).where(and(eq(schema.fixes.id, fixId), eq(schema.fixes.accountId, accountId)));
  if (!fix?.siteId) throw new Error('Fix not found.');
  if (fix.status === 'applied') throw new Error('Already published. Roll back first to publish again.');
  const conn = await getCreds(fix.siteId, accountId);
  if (!conn) throw new Error('Connect WordPress for this site first.');

  try {
    const resolved = await wpCall<{ post_id: number; current: SeoValues }>(conn.creds, '/resolve', { url: fix.pageUrl });
    const set: Partial<SeoValues> = {};
    if (fields.title) set.title = fields.title;
    if (fields.description) set.description = fields.description;
    const result = await wpCall<{ previous: SeoValues; current: SeoValues }>(conn.creds, '/seo', { post_id: resolved.post_id, expected: resolved.current, set });
    await db.update(schema.fixes).set({
      status: 'applied', applied: { postId: resolved.post_id, ...set }, previous: result.previous, appliedAt: new Date(), error: null,
    }).where(eq(schema.fixes.id, fixId));
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Publishing failed.';
    await db.update(schema.fixes).set({ status: e instanceof WpError && e.status === 409 ? 'conflict' : 'failed', error: message }).where(eq(schema.fixes.id, fixId));
    if (e instanceof WpError && e.status === 401) await db.update(schema.integrations).set({ status: 'error', lastError: message }).where(eq(schema.integrations.id, conn.row.id));
    throw e;
  }
}

// Restores the stored previous values, but only if nobody changed the page since we published.
export async function rollbackFix(fixId: string, accountId: string) {
  const db = await getDb();
  const [fix] = await db.select().from(schema.fixes).where(and(eq(schema.fixes.id, fixId), eq(schema.fixes.accountId, accountId)));
  if (!fix?.siteId || fix.status !== 'applied') throw new Error('Only published fixes can be rolled back.');
  const conn = await getCreds(fix.siteId, accountId);
  if (!conn) throw new Error('WordPress is no longer connected.');
  const applied = fix.applied as { postId: number } & Partial<SeoValues>;
  const previous = fix.previous as SeoValues;
  const expected: Partial<SeoValues> = {};
  const set: Partial<SeoValues> = {};
  for (const k of ['title', 'description'] as const) {
    if (applied[k] !== undefined) { expected[k] = applied[k]; set[k] = previous[k]; }
  }
  try {
    await wpCall(conn.creds, '/seo', { post_id: applied.postId, expected, set });
    await db.update(schema.fixes).set({ status: 'rolled_back', error: null }).where(eq(schema.fixes.id, fixId));
  } catch (e) {
    if (e instanceof WpError && e.status === 409) throw new Error('This page was edited in WordPress after we published, so rollback was skipped to protect those edits.');
    throw e;
  }
}

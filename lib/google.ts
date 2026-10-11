import { and, eq, sql } from 'drizzle-orm';
import { decrypt } from './crypto';
import { getDb, schema } from './db';
import { appUrl } from './email';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => `${appUrl()}/api/google/callback`;

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: 'code', scope: GOOGLE_SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? 'Google token request failed');
  return json as { access_token: string; refresh_token?: string; expires_in: number };
}

export const exchangeCode = (code: string) => tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
const refresh = (refreshToken: string) => tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });

async function gsc<T>(accessToken: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message ?? `Search Console API ${res.status}`);
  return json as T;
}

// Picks the Search Console property that covers the site: domain property first, then URL prefixes.
export async function findProperty(accessToken: string, host: string) {
  const { siteEntry = [] } = await gsc<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(accessToken, '/sites');
  const usable = siteEntry.filter(s => s.permissionLevel !== 'siteUnverifiedUser');
  const candidates = [`sc-domain:${host}`, `https://${host}/`, `https://www.${host}/`, `http://${host}/`, `http://www.${host}/`];
  return candidates.map(c => usable.find(s => s.siteUrl === c)).find(Boolean)?.siteUrl ?? null;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

// Pulls daily page+query rows into gsc_rows. First sync: 90 days, then the last 5 days (Google's data lags).
export async function syncSearchConsole({ siteId }: { siteId: string }) {
  const db = await getDb();
  const [integration] = await db.select().from(schema.integrations).where(and(eq(schema.integrations.siteId, siteId), eq(schema.integrations.provider, 'google')));
  if (!integration) return;
  const { refreshToken } = JSON.parse(decrypt(integration.credentials)) as { refreshToken: string };
  const property = (integration.meta as { property: string }).property;

  let accessToken: string;
  try {
    accessToken = (await refresh(refreshToken)).access_token;
  } catch (e) {
    await db.update(schema.integrations).set({ status: 'error', lastError: 'Google access was revoked or expired. Reconnect.' }).where(eq(schema.integrations.id, integration.id));
    throw e;
  }

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.gscRows).where(eq(schema.gscRows.siteId, siteId));
  const end = new Date(Date.now() - 2 * 86_400_000);
  const start = new Date(end.getTime() - (n === 0 ? 90 : 5) * 86_400_000);

  let startRow = 0;
  for (let page = 0; page < 8; page++) {
    const { rows = [] } = await gsc<{ rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] }>(
      accessToken, `/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
      { startDate: day(start), endDate: day(end), dimensions: ['date', 'page', 'query'], rowLimit: 25000, startRow, dataState: 'final' },
    );
    for (let i = 0; i < rows.length; i += 500) {
      const values = rows.slice(i, i + 500).map(r => ({ siteId, date: r.keys[0], page: r.keys[1], query: r.keys[2], clicks: r.clicks, impressions: r.impressions, position: r.position }));
      await db.insert(schema.gscRows).values(values).onConflictDoUpdate({
        target: [schema.gscRows.siteId, schema.gscRows.date, schema.gscRows.page, schema.gscRows.query],
        set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, position: sql`excluded.position` },
      });
    }
    if (rows.length < 25000) break;
    startRow += rows.length;
  }
  await db.update(schema.integrations).set({ status: 'connected', lastError: null, meta: { ...(integration.meta as object), lastSyncAt: new Date().toISOString() } }).where(eq(schema.integrations.id, integration.id));
}

export async function scheduleSearchConsoleSyncs() {
  const db = await getDb();
  const { enqueue } = await import('./jobs');
  const rows = await db.execute(sql`
    select i.site_id from integrations i join accounts a on a.id = i.account_id
    where i.provider = 'google' and a.deleted_at is null and a.disabled_at is null
      and coalesce((i.meta->>'lastSyncAt')::timestamptz, 'epoch') < now() - interval '20 hours'
      and not exists (select 1 from jobs j where j.type = 'gsc-sync' and j.status in ('queued','running') and j.payload->>'siteId' = i.site_id::text)`);
  for (const r of rows.rows as { site_id: string }[]) await enqueue('gsc-sync', { siteId: r.site_id });
}

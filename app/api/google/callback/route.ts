import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getSession, logAction } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { getDb, schema } from '@/lib/db';
import { appUrl } from '@/lib/email';
import { exchangeCode, findProperty } from '@/lib/google';
import { enqueue } from '@/lib/jobs';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return Response.redirect(`${appUrl()}/login`);
  const url = new URL(req.url);
  const jar = await cookies();
  const [state, siteId] = (jar.get('sa_google_state')?.value ?? '').split('.');
  jar.delete('sa_google_state');
  const back = (msg: string) => Response.redirect(`${appUrl()}/app/sites/${siteId}/google?error=${encodeURIComponent(msg)}`);

  if (!state || url.searchParams.get('state') !== state) return Response.redirect(`${appUrl()}/app`);
  if (url.searchParams.get('error')) return back('Google access was not granted.');

  const db = await getDb();
  const [site] = await db.select().from(schema.sites).where(and(eq(schema.sites.id, siteId), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (!site) return Response.redirect(`${appUrl()}/app`);

  try {
    const tokens = await exchangeCode(url.searchParams.get('code') ?? '');
    if (!tokens.refresh_token) return back('Google did not return offline access. Remove the app at myaccount.google.com/permissions and try again.');
    const property = await findProperty(tokens.access_token, site.host);
    if (!property) return back(`No Search Console property for ${site.host} in this Google account. Add and verify it at search.google.com/search-console first.`);

    const values = { accountId: s.account.id, siteId, provider: 'google' as const, status: 'connected' as const, credentials: encrypt(JSON.stringify({ refreshToken: tokens.refresh_token })), meta: { property }, lastError: null };
    await db.insert(schema.integrations).values(values).onConflictDoUpdate({ target: [schema.integrations.siteId, schema.integrations.provider], set: values });
    await db.update(schema.sites).set({ verifiedAt: new Date() }).where(eq(schema.sites.id, siteId)); // verified in Search Console
    await enqueue('gsc-sync', { siteId });
    await logAction('google_connected', { accountId: s.account.id, userId: s.user.id, target: site.host, meta: { property } });
    return Response.redirect(`${appUrl()}/app/sites/${siteId}/google?connected=1`);
  } catch (e) {
    return back(e instanceof Error ? e.message : 'Google connection failed.');
  }
}

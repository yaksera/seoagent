import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getSession, newToken } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { appUrl } from '@/lib/email';
import { authUrl, googleConfigured } from '@/lib/google';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return Response.redirect(`${appUrl()}/login`);
  const siteId = new URL(req.url).searchParams.get('siteId') ?? '';
  if (!googleConfigured() || !/^[0-9a-f-]{36}$/.test(siteId)) return Response.redirect(`${appUrl()}/app`);
  const db = await getDb();
  const [site] = await db.select({ id: schema.sites.id }).from(schema.sites).where(and(eq(schema.sites.id, siteId), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (!site) return Response.redirect(`${appUrl()}/app`);

  // CSRF protection for the OAuth round trip: random state kept in a short-lived cookie.
  const state = newToken();
  (await cookies()).set('sa_google_state', `${state}.${siteId}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
  return Response.redirect(authUrl(state));
}

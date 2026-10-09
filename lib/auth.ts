import 'server-only';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt, sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getDb, schema } from './db';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = 'sa_session';
const SESSION_DAYS = 30;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, salt, key] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export async function clientInfo() {
  const h = await headers();
  return { ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local', userAgent: h.get('user-agent') ?? '' };
}

export async function logAction(action: string, opts: { accountId?: string | null; userId?: string | null; target?: string; meta?: unknown; ip?: string } = {}) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({ action, accountId: opts.accountId ?? null, userId: opts.userId ?? null, target: opts.target, meta: opts.meta ?? null, ip: opts.ip });
}

// Rate limit backed by the audit log, so it works across several server instances.
export async function tooManyAttempts(action: string, ip: string, max: number, minutes: number) {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, action), eq(schema.auditLog.ip, ip), gt(schema.auditLog.createdAt, sql`now() - make_interval(mins => ${minutes})`)));
  return (row?.n ?? 0) >= max;
}

export async function createSession(userId: string, impersonatorId?: string) {
  const db = await getDb();
  const token = newToken();
  const { ip, userAgent } = await clientInfo();
  const hours = impersonatorId ? 0.5 : SESSION_DAYS * 24;
  const expiresAt = new Date(Date.now() + hours * 3600_000);
  await db.insert(schema.sessions).values({ id: sha256(token), userId, impersonatorId, expiresAt, ip, userAgent: userAgent.slice(0, 300) });
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt });
}

// Admin support sessions: the admin's own token is parked in a second cookie and
// restored when they stop. The impersonation session expires after 30 minutes.
const RETURN_COOKIE = 'sa_admin_return';

export async function startImpersonation(targetUserId: string, adminUserId: string) {
  const jar = await cookies();
  const adminToken = jar.get(COOKIE)?.value;
  if (!adminToken) return;
  jar.set(RETURN_COOKIE, adminToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 3600 });
  await createSession(targetUserId, adminUserId);
}

export async function endImpersonation() {
  const jar = await cookies();
  const back = jar.get(RETURN_COOKIE)?.value;
  await destroySession();
  if (back) {
    jar.set(COOKIE, back, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400 });
    jar.delete(RETURN_COOKIE);
  }
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await (await getDb()).delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

const adminEmails = () => (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db.select({ session: schema.sessions, user: schema.users, account: schema.accounts })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.users.accountId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())));
  if (!row || row.account.deletedAt) return null;
  const isAdmin = row.user.isAdmin || adminEmails().includes(row.user.email);
  return { ...row, isAdmin, impersonating: Boolean(row.session.impersonatorId) };
}

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function requireUser(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.account.disabledAt && !s.impersonating) redirect('/login?disabled=1');
  return s;
}

// Admin pages answer 404 to everyone else, so the panel isn't discoverable.
export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s || !s.isAdmin || s.impersonating) notFound();
  return s;
}

export async function createEmailToken(userId: string, type: 'verify' | 'reset') {
  const token = newToken();
  const hours = type === 'verify' ? 48 : 1;
  await (await getDb()).insert(schema.emailTokens).values({ id: sha256(token), userId, type, expiresAt: new Date(Date.now() + hours * 3600_000) });
  return token;
}

export async function consumeEmailToken(token: string, type: 'verify' | 'reset') {
  const db = await getDb();
  const [row] = await db.update(schema.emailTokens).set({ usedAt: new Date() })
    .where(and(eq(schema.emailTokens.id, sha256(token)), eq(schema.emailTokens.type, type), gt(schema.emailTokens.expiresAt, new Date()), sql`${schema.emailTokens.usedAt} is null`))
    .returning();
  return row?.userId ?? null;
}

'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clientInfo, createEmailToken, createSession, destroySession, hashPassword, logAction, tooManyAttempts, consumeEmailToken, verifyPassword } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { appUrl, sendEmail } from '@/lib/email';
import { TRIAL_DAYS } from '@/lib/plans';

export type FormState = { error?: string; ok?: string } | undefined;

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const password = z.string().min(10, 'Use at least 10 characters').max(200);

async function sendVerification(userId: string, to: string) {
  const token = await createEmailToken(userId, 'verify');
  await sendEmail(to, 'Confirm your email for SEO Agent', `Confirm your email address:\n${appUrl()}/verify?token=${token}\n\nThe link works for 48 hours.`);
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const { ip } = await clientInfo();
  if (await tooManyAttempts('signup', ip, 5, 60)) return { error: 'Too many sign-ups from this network. Try again later.' };
  const parsed = z.object({ name: z.string().trim().min(1, 'Enter your name').max(100), email, password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name } = parsed.data;

  const db = await getDb();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, parsed.data.email));
  if (existing) return { error: 'An account with this email already exists. Log in instead.' };

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await db.transaction(async tx => {
    const [account] = await tx.insert(schema.accounts).values({ name, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) }).returning();
    const [u] = await tx.insert(schema.users).values({ accountId: account.id, email: parsed.data.email, name, passwordHash }).returning();
    return u;
  });
  await logAction('signup', { accountId: user.accountId, userId: user.id, ip });
  await sendVerification(user.id, user.email);
  await createSession(user.id);
  redirect('/app');
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const { ip } = await clientInfo();
  if (await tooManyAttempts('login_failed', ip, 10, 15)) return { error: 'Too many failed attempts. Wait 15 minutes and try again.' };
  const parsed = z.object({ email, password: z.string().min(1).max(200) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Enter your email and password.' };

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email));
  // Same message and similar timing whether or not the email exists.
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : (await hashPassword(parsed.data.password), false);
  if (!user || !ok) {
    await logAction('login_failed', { ip, target: parsed.data.email });
    return { error: 'Email or password is incorrect.' };
  }
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await logAction('login', { accountId: user.accountId, userId: user.id, ip });
  await createSession(user.id);
  redirect('/app');
}

export async function logout() {
  await destroySession();
  redirect('/');
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const { ip } = await clientInfo();
  if (await tooManyAttempts('password_reset_requested', ip, 5, 60)) return { error: 'Too many requests. Try again later.' };
  const parsed = email.safeParse(form.get('email'));
  if (!parsed.success) return { error: 'Enter a valid email address.' };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data));
  await logAction('password_reset_requested', { ip, target: parsed.data, userId: user?.id });
  if (user) {
    const token = await createEmailToken(user.id, 'reset');
    await sendEmail(user.email, 'Reset your SEO Agent password', `Choose a new password:\n${appUrl()}/reset?token=${token}\n\nThe link works for 1 hour. If you didn't ask for this, ignore this email.`);
  }
  return { ok: 'If that email has an account, a reset link is on its way.' };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ token: z.string().min(10), password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const userId = await consumeEmailToken(parsed.data.token, 'reset');
  if (!userId) return { error: 'This link has expired or was already used. Request a new one.' };
  const db = await getDb();
  await db.update(schema.users).set({ passwordHash: await hashPassword(parsed.data.password), emailVerifiedAt: new Date() }).where(eq(schema.users.id, userId));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)); // log out everywhere
  await logAction('password_reset', { userId, ip: (await clientInfo()).ip });
  await createSession(userId);
  redirect('/app');
}

export async function resendVerification() {
  const { getSession } = await import('@/lib/auth');
  const s = await getSession();
  if (s && !s.user.emailVerifiedAt) await sendVerification(s.user.id, s.user.email);
  return { ok: 'Verification email sent.' };
}

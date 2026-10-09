import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { AuthShell } from '@/components/ui';
import { logAction, consumeEmailToken } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const userId = token ? await consumeEmailToken(token, 'verify') : null;
  if (userId) {
    const db = await getDb();
    await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, userId));
    await logAction('email_verified', { userId });
  }
  return (
    <AuthShell title={userId ? 'Email confirmed' : 'Link expired'}>
      <p className="text-muted">{userId ? 'Thanks, your email address is confirmed.' : 'This link has expired or was already used. Log in to send a new one.'}</p>
      <Link href="/app" className="mt-6 inline-block underline">Go to your dashboard</Link>
    </AuthShell>
  );
}

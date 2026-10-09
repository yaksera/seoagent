import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { AuditReport } from '@/components/audit-report';
import { getSession } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Public page for free audits (shareable link). Account audits live under /app.
export default async function PublicAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [audit] = await db.select().from(schema.audits).where(eq(schema.audits.id, id));
  if (!audit) notFound();
  if (audit.accountId) {
    const s = await getSession();
    if (s?.account.id === audit.accountId) redirect(`/app/audits/${id}`);
    notFound();
  }
  return <AuditReport audit={audit} canFix={false} fixes={{}} />;
}

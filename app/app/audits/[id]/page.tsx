import { and, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AuditReport } from '@/components/audit-report';
import { requireUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import type { PageFix } from '@/lib/fixes';
import { isActive } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export default async function AppAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await requireUser();
  const db = await getDb();
  const [audit] = await db.select().from(schema.audits).where(and(eq(schema.audits.id, id), eq(schema.audits.accountId, s.account.id)));
  if (!audit) notFound();

  const rows = await db.select().from(schema.fixes).where(eq(schema.fixes.auditId, audit.id));
  const fixes = Object.fromEntries(rows.map(r => [r.pageUrl, { ...(r.suggestion as PageFix), fixId: r.id, status: r.status }]));
  const [wp] = audit.siteId
    ? await db.select({ id: schema.integrations.id }).from(schema.integrations).where(and(eq(schema.integrations.siteId, audit.siteId), eq(schema.integrations.provider, 'wordpress')))
    : [];

  return (
    <div className="space-y-6">
      {audit.siteId && <Link href={`/app/sites/${audit.siteId}`} className="text-sm text-muted hover:text-ink">← Back to site</Link>}
      <AuditReport audit={audit} canFix={isActive(s.account)} fixes={fixes} applyAvailable={Boolean(wp)} />
    </div>
  );
}

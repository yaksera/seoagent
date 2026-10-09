import { and, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/action-button';
import { AuthForm, btnSecondaryCls } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { connectWordPress, disconnectWordPress } from './actions';

export const dynamic = 'force-dynamic';

export default async function WordPressPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ connected?: string }> }) {
  const { id } = await params;
  const { connected } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await requireUser();
  const db = await getDb();
  const [site] = await db.select().from(schema.sites).where(and(eq(schema.sites.id, id), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (!site) notFound();
  const [wp] = await db.select().from(schema.integrations).where(and(eq(schema.integrations.siteId, id), eq(schema.integrations.provider, 'wordpress')));
  const meta = (wp?.meta ?? {}) as { provider?: string; wordpress?: string; plugin?: string };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link href={`/app/sites/${id}`} className="text-sm text-muted hover:text-ink">← {site.host}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">WordPress</h1>
      </div>
      {connected && <p role="status" className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">Connected. Open an audit and publish fixes from the “Fixes” section.</p>}
      {wp ? (
        <section className="space-y-3 rounded-md border border-line bg-white p-5">
          <p>Connected{wp.status === 'error' && <span className="text-critical"> (error: {wp.lastError})</span>}.</p>
          <p className="text-sm text-muted">WordPress {meta.wordpress} · connector {meta.plugin} · writes to {meta.provider === 'own' ? 'its own fields (no SEO plugin found)' : meta.provider}</p>
          <ActionButton action={async () => { 'use server'; await disconnectWordPress(id); return undefined; }} label="Disconnect" className={btnSecondaryCls} confirm="Disconnect WordPress? Published fixes stay on your site." />
        </section>
      ) : (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Download <a href="/seo-agent-connector.zip" className="underline">the SEO Agent Connector plugin</a>, then in WordPress go to <b>Plugins → Add New → Upload</b> and activate it.</li>
            <li>In WordPress, open <b>Settings → SEO Agent</b> and copy the connection key.</li>
            <li>Go to <b>Users → Profile → Application Passwords</b>, create one called “SEO Agent” and copy it.</li>
            <li>Paste both below with your WordPress username.</li>
          </ol>
          <section className="rounded-md border border-line bg-white p-5">
            <AuthForm action={connectWordPress.bind(null, id)} submit="Connect WordPress" pending="Checking connection…" fields={[
              { name: 'username', label: 'WordPress username', autoComplete: 'off' },
              { name: 'appPassword', label: 'Application Password', type: 'password', autoComplete: 'off' },
              { name: 'key', label: 'Connection key', autoComplete: 'off' },
            ]} />
            <p className="mt-3 text-xs text-muted">Stored encrypted. Only used to update titles and meta descriptions you approve. You can revoke the Application Password in WordPress at any time.</p>
          </section>
        </>
      )}
    </div>
  );
}

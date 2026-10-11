import { and, desc, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/action-button';
import { CopyButton } from '@/components/copy-button';
import { btnSecondaryCls } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { type Brand, buildFaqJsonLd, buildJsonLd, buildLlmsTxt, emptyBrand, prefillFromCrawl } from '@/lib/brand';
import type { CrawlResult } from '@/lib/crawler';
import { getDb, schema } from '@/lib/db';
import { publishFeedAction, rollbackFeedAction, saveBrand } from './actions';
import { BrandForm } from './brand-form';

export const dynamic = 'force-dynamic';

function CodeBlock({ title, code, note }: { title: string; code: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <CopyButton text={code} />
      </div>
      <pre className="max-h-80 overflow-auto p-4 text-xs leading-relaxed">{code}</pre>
      {note && <p className="border-t border-line px-4 py-2 text-xs text-muted">{note}</p>}
    </div>
  );
}

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await requireUser();
  const db = await getDb();
  const [site] = await db.select().from(schema.sites).where(and(eq(schema.sites.id, id), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (!site) notFound();
  const [profile] = await db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.siteId, id));
  const [audit] = await db.select({ crawl: schema.audits.crawl }).from(schema.audits)
    .where(and(eq(schema.audits.siteId, id), eq(schema.audits.status, 'done'))).orderBy(desc(schema.audits.createdAt)).limit(1);
  const [wp] = await db.select({ id: schema.integrations.id }).from(schema.integrations).where(and(eq(schema.integrations.siteId, id), eq(schema.integrations.provider, 'wordpress')));
  const crawl = (audit?.crawl as CrawlResult) ?? null;
  const brand: Brand = profile ? { ...emptyBrand(), ...(profile.data as Brand) } : prefillFromCrawl(crawl);

  const llms = profile ? buildLlmsTxt(brand, crawl) : '';
  const jsonLd = profile ? JSON.stringify(buildJsonLd(brand, site.url), null, 2) : '';
  const faq = profile ? buildFaqJsonLd(brand.faqs) : null;

  return (
    <div className="space-y-10">
      <div>
        <Link href={`/app/sites/${id}`} className="text-sm text-muted hover:text-ink">← {site.host}</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Brand Memory &amp; AI Feed</h1>
        <p className="mt-2 max-w-2xl text-muted">The facts you confirm here are the only facts the agent uses when it writes for you. They also become your <b>llms.txt</b> and business structured data, the two things AI assistants read to understand who you are.</p>
        {!profile && <p className="mt-4 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">We filled in what we could find on your site. Check it, complete it and save.</p>}
      </div>

      <section className="rounded-xl border border-line bg-white p-6">
        <BrandForm action={saveBrand.bind(null, id)} brand={brand} />
      </section>

      {profile && (
        <section className="space-y-4" aria-labelledby="feed">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="feed" className="text-xl font-semibold">Your AI feed</h2>
              <p className="text-sm text-muted">{profile.feedPublishedAt ? `Published to WordPress ${profile.feedPublishedAt.toLocaleString('en-GB')}.` : 'Not published yet.'}</p>
            </div>
            {wp ? (
              <div className="flex flex-wrap items-start gap-3">
                <ActionButton action={async () => { 'use server'; return publishFeedAction(id); }} label={profile.feedPublishedAt ? 'Publish again' : 'Publish to WordPress'} pending="Publishing…" />
                {profile.feedPublishedAt && <ActionButton action={async () => { 'use server'; return rollbackFeedAction(id); }} label="Roll back" pending="Rolling back…" className={btnSecondaryCls} />}
              </div>
            ) : (
              <Link href={`/app/sites/${id}/wordpress`} className={btnSecondaryCls}>Connect WordPress to publish in one click</Link>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <CodeBlock title="llms.txt" code={llms} note={`Not on WordPress? Save this as a file named llms.txt at ${site.url}llms.txt`} />
            <CodeBlock title="Business structured data (JSON-LD)" code={`<script type="application/ld+json">\n${jsonLd}\n</script>`} note="Goes in the <head> of your home page. WordPress publishing adds it for you." />
          </div>
          {faq && <CodeBlock title="FAQ structured data" code={`<script type="application/ld+json">\n${JSON.stringify(faq, null, 2)}\n</script>`} note="Only add this to a page that shows these exact questions and answers. Google ignores or penalises FAQ markup for content that isn't on the page." />}
        </section>
      )}
    </div>
  );
}

import Link from 'next/link';
import { FixPanel } from '@/components/fix-panel';
import type { CrawlResult } from '@/lib/crawler';
import type { schema } from '@/lib/db';
import type { PageFix } from '@/lib/fixes';
import type { Issue, Severity } from '@/lib/rules';
import { AuditProgress } from './audit-progress';

type AuditRow = typeof schema.audits.$inferSelect;

const SEV: Record<Severity, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'text-critical border-critical/40' },
  warning: { label: 'Warning', cls: 'text-warning border-warning/40' },
  info: { label: 'Info', cls: 'text-info border-info/40' },
};

const scoreColour = (s: number) => (s >= 80 ? 'text-accent' : s >= 50 ? 'text-warning' : 'text-critical');
const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AuditReport({ audit, canFix, fixes, applyAvailable }: { audit: AuditRow; canFix: boolean; fixes: Record<string, PageFix & { fixId?: string; status?: string }>; applyAvailable?: boolean }) {
  if (audit.status === 'queued' || audit.status === 'running') return <AuditProgress status={audit.status} url={audit.url} />;
  if (audit.status === 'failed') {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold">The audit couldn&apos;t finish</h1>
        <p className="mt-2 text-muted">{audit.url}</p>
        <p role="alert" className="mt-4 rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">{audit.error}</p>
      </div>
    );
  }

  const crawl = audit.crawl as CrawlResult;
  const issues = (audit.issues as Issue[]) ?? [];
  const score = audit.score ?? 0;
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  issues.forEach(i => { counts[i.severity] += i.findings.length; });

  const fixableByPage = new Map<string, string[]>();
  for (const i of issues.filter(i => i.fixable)) for (const f of i.findings) fixableByPage.set(f.url, [...(fixableByPage.get(f.url) ?? []), i.name]);
  const fixPages = crawl.pages.filter(p => fixableByPage.has(p.url)).sort((a, b) => fixableByPage.get(b.url)!.length - fixableByPage.get(a.url)!.length);

  return (
    <div className="space-y-12">
      <section className="grid gap-6 border-b border-line pb-8 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <p className="text-sm text-muted">Health score</p>
          <p className={`font-mono text-7xl font-medium leading-none ${scoreColour(score)}`}>{score}</p>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{crawl.host}</h1>
          <p className="mt-1 text-sm text-muted">
            {plural(crawl.pages.length, 'page', 'pages')} checked in {Math.round((audit.durationMs ?? 0) / 1000)}s · {audit.createdAt.toLocaleString('en-GB')}
            {crawl.limitReached && ' · page limit reached'}
          </p>
          <p className="mt-3 flex flex-wrap gap-4 text-sm">
            <span><b className="font-mono text-critical">{counts.critical}</b> critical</span>
            <span><b className="font-mono text-warning">{counts.warning}</b> {counts.warning === 1 ? 'warning' : 'warnings'}</span>
            <span><b className="font-mono text-info">{counts.info}</b> {counts.info === 1 ? 'notice' : 'notices'}</span>
          </p>
        </div>
      </section>

      <section aria-labelledby="issues">
        <h2 id="issues" className="text-xl font-semibold">Problems found</h2>
        {issues.length === 0 && <p className="mt-3 text-muted">No problems found on the pages checked.</p>}
        <div className="mt-4 divide-y divide-line border-y border-line">
          {issues.map(issue => (
            <details key={issue.id} className="py-4">
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${SEV[issue.severity].cls}`}>{SEV[issue.severity].label}</span>
                <span className="flex-1">
                  <span className="font-medium">{issue.name}</span>
                  <span className="block text-sm text-muted">{issue.why}</span>
                </span>
                <span className="shrink-0 font-mono text-sm text-muted">{issue.findings.length}</span>
              </summary>
              <ul className="mt-3 space-y-1 pl-2 text-sm sm:pl-20">
                {issue.findings.slice(0, 50).map(f => (
                  <li key={f.url + (f.detail ?? '')} className="break-all">
                    <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-line underline-offset-2 hover:decoration-ink">{pathOf(f.url)}</a>
                    {f.detail && <span className="text-muted"> · {f.detail}</span>}
                  </li>
                ))}
                {issue.findings.length > 50 && <li className="text-muted">and {issue.findings.length - 50} more</li>}
              </ul>
            </details>
          ))}
        </div>
      </section>

      {fixPages.length > 0 && (
        <section aria-labelledby="fixes">
          <h2 id="fixes" className="text-xl font-semibold">Fixes the agent can write</h2>
          {canFix ? (
            <>
              <p className="mt-1 text-sm text-muted">
                Open a page to get a new title, meta description and H1.{applyAvailable ? ' Review them, then publish to WordPress in one click (you can roll back).' : ' Review them, then paste them into your site.'}
              </p>
              <div className="mt-4 divide-y divide-line border-y border-line">
                {fixPages.map(p => {
                  const names = fixableByPage.get(p.url)!;
                  return (
                    <details key={p.url} className="py-4">
                      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
                        <span className="break-all font-medium">{pathOf(p.url)}</span>
                        <span className="text-sm text-muted">{plural(names.length, 'issue', 'issues')}</span>
                      </summary>
                      <p className="mt-2 text-sm text-muted">{names.join(' · ')}</p>
                      <div className="mt-3">
                        <FixPanel auditId={audit.id} url={p.url} current={{ title: p.title, meta: p.metaDescription, h1: p.h1.join(' | ') }} initial={fixes[p.url]} applyAvailable={applyAvailable} />
                      </div>
                    </details>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-md border border-line bg-white p-4">
              <p>{plural(fixPages.length, 'page has', 'pages have')} problems the agent can fix: new titles, meta descriptions and headings written for each page.</p>
              <Link href="/signup" className="mt-3 inline-block rounded-md bg-ink px-4 py-2 font-medium text-white hover:bg-accent">Start free trial to get fixes</Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

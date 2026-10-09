import { notFound } from 'next/navigation';
import { FixPanel } from '@/components/fix-panel';
import type { Severity } from '@/lib/rules';
import { loadAudit } from '@/lib/store';

export const dynamic = 'force-dynamic';

const SEV: Record<Severity, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'text-critical border-critical/40' },
  warning: { label: 'Warning', cls: 'text-warning border-warning/40' },
  info: { label: 'Info', cls: 'text-info border-info/40' },
};

const scoreColour = (s: number) => (s >= 80 ? 'text-accent' : s >= 50 ? 'text-warning' : 'text-critical');
const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAudit(id);
  if (!audit) notFound();

  const { crawl, issues, score } = audit;
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  issues.forEach(i => { counts[i.severity] += i.findings.length; });

  // Pages that have something the AI can fix, most problems first.
  const fixableByPage = new Map<string, string[]>();
  for (const i of issues.filter(i => i.fixable)) for (const f of i.findings) fixableByPage.set(f.url, [...(fixableByPage.get(f.url) ?? []), i.name]);
  const fixPages = crawl.pages
    .filter(p => fixableByPage.has(p.url))
    .sort((a, b) => fixableByPage.get(b.url)!.length - fixableByPage.get(a.url)!.length);

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
            {crawl.pages.length} pages checked in {Math.round(audit.durationMs / 1000)}s · {new Date(audit.createdAt).toLocaleString('en-GB')}
            {crawl.limitReached && ' · page limit reached, larger sites need a full crawl'}
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
          <p className="mt-1 text-sm text-muted">Open a page to get a new title, meta description and H1. Review them, then paste them into your site.</p>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {fixPages.map(p => {
              const names = fixableByPage.get(p.url)!;
              return (
                <details key={p.url} className="py-4">
                  <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
                    <span className="break-all font-medium">{pathOf(p.url)}</span>
                    <span className="text-sm text-muted">{names.length} issue{names.length > 1 ? 's' : ''}</span>
                  </summary>
                  <p className="mt-2 text-sm text-muted">{names.join(' · ')}</p>
                  <div className="mt-3">
                    <FixPanel auditId={audit.id} url={p.url} current={{ title: p.title, meta: p.metaDescription, h1: p.h1.join(' | ') }} initial={audit.fixes[p.url]} />
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

import type { AiCheck, AiReadiness, Group } from '@/lib/ai-readiness';
import { CopyButton } from './copy-button';

const STATUS: Record<AiCheck['status'], { label: string; cls: string }> = {
  pass: { label: 'Pass', cls: 'bg-accent/10 text-accent' },
  partial: { label: 'Partly', cls: 'bg-warning/10 text-warning' },
  fail: { label: 'Fix', cls: 'bg-critical/10 text-critical' },
};

const GROUPS: { id: Group; title: string; intro: string }[] = [
  { id: 'Access', title: 'Can AI find you?', intro: 'Whether AI crawlers are allowed in and can discover your pages.' },
  { id: 'Readability', title: 'Can AI read you?', intro: 'Whether your pages are easy for AI to extract accurate answers from.' },
  { id: 'Trust', title: 'Does AI trust you?', intro: 'Whether AI can confirm who you are and how to reach you.' },
  { id: 'Agent standards', title: 'Can AI agents act?', intro: 'New standards for AI agents. Most sites don’t have these yet, so they carry little weight.' },
];

const PURPOSE = { search: 'Answers & search', user: 'Fetches when asked', training: 'Model training' };

export function AiReport({ ai }: { ai: AiReadiness }) {
  const fixes = ai.checks.filter(c => c.status !== 'pass').sort((a, b) => (b.weight - b.earned) - (a.weight - a.earned));
  return (
    <div className="space-y-10">
      {fixes.length > 0 && (
        <section aria-labelledby="ai-top">
          <h3 id="ai-top" className="font-semibold">Fix these first</h3>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {fixes.slice(0, 3).map((c, i) => (
              <li key={c.id} className="rounded-lg border border-line bg-white p-4">
                <span className="font-mono text-xs text-muted">0{i + 1} · up to +{Math.round(((c.weight - c.earned) / ai.checks.reduce((a, x) => a + x.weight, 0)) * 100)} points</span>
                <p className="mt-1 font-medium">{c.name}</p>
                <p className="mt-1 text-sm text-muted">{c.fix ?? c.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="ai-bots">
        <h3 id="ai-bots" className="font-semibold">AI crawlers and your robots.txt</h3>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-line text-muted"><tr><th className="px-3 py-2 font-normal">Crawler</th><th className="font-normal">Used for</th><th className="font-normal">Purpose</th><th className="px-3 font-normal">Access</th></tr></thead>
            <tbody className="divide-y divide-line">
              {ai.bots.map(b => (
                <tr key={b.bot}>
                  <td className="px-3 py-2 font-mono text-xs">{b.bot}</td><td>{b.company}</td><td className="text-muted">{PURPOSE[b.purpose]}</td>
                  <td className="px-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${b.allowed ? 'bg-accent/10 text-accent' : b.purpose === 'training' ? 'bg-line text-muted' : 'bg-critical/10 text-critical'}`}>{b.allowed ? 'Allowed' : 'Blocked'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Blocking training crawlers is a fair choice and doesn&apos;t remove you from AI answers. Blocking search and user crawlers does.</p>
      </section>

      {GROUPS.map(g => {
        const checks = ai.checks.filter(c => c.group === g.id);
        const earned = checks.reduce((a, c) => a + c.earned, 0), max = checks.reduce((a, c) => a + c.weight, 0);
        return (
          <section key={g.id} aria-labelledby={`g-${g.id}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 id={`g-${g.id}`} className="font-semibold">{g.title}</h3>
              <span className="font-mono text-sm text-muted">{Math.round(earned)} / {max}</span>
            </div>
            <p className="text-sm text-muted">{g.intro}</p>
            <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white">
              {checks.map(c => (
                <li key={c.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted">{c.detail}</p>
                      {c.status !== 'pass' && c.fix && <p className="mt-2 text-sm">{c.fix}</p>}
                      {c.status !== 'pass' && c.snippet && (
                        <div className="mt-2 flex items-start gap-2">
                          <pre className="flex-1 overflow-x-auto rounded-md bg-ink p-3 text-xs text-white">{c.snippet}</pre>
                          <CopyButton text={c.snippet} />
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted">{c.weight} pts</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-muted">AI-readiness is our own measure based on how these crawlers are documented to work. No AI company publishes an official score, and a high score doesn&apos;t guarantee being mentioned.</p>
    </div>
  );
}

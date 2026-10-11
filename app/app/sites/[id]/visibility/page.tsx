import { and, asc, eq, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Stat } from '@/components/admin';
import { ActionButton } from '@/components/action-button';
import { AuthForm } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import type { Brand } from '@/lib/brand';
import { getDb, schema } from '@/lib/db';
import { engineLabel, engines, latestVisibility, MAX_PROMPTS, runningVisibility, suggestPrompts } from '@/lib/visibility';
import { addPrompts, removePrompt, runNow } from './actions';

export const dynamic = 'force-dynamic';

const Badge = ({ on, yes, no }: { on: boolean; yes: string; no: string }) => (
  <span className={`rounded px-2 py-0.5 text-xs font-medium ${on ? 'bg-accent/10 text-accent' : 'bg-line text-muted'}`}>{on ? yes : no}</span>
);

export default async function VisibilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await requireUser();
  const db = await getDb();
  const [site] = await db.select().from(schema.sites).where(and(eq(schema.sites.id, id), eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (!site) notFound();
  const prompts = await db.select().from(schema.visibilityPrompts).where(eq(schema.visibilityPrompts.siteId, id)).orderBy(asc(schema.visibilityPrompts.createdAt));
  const [profile] = await db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.siteId, id));
  const { latest, rate, previousRate, citedRate } = await latestVisibility(id);
  const running = await runningVisibility(id);
  const engineNames = [...new Set(engines().map(engineLabel))];
  const suggestions = suggestPrompts((profile?.data as Brand) ?? null, site.host).filter(x => !prompts.some(p => p.prompt === x));

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/app/sites/${id}`} className="text-sm text-muted hover:text-ink">← {site.host}</Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">AI visibility</h1>
          <p className="mt-2 max-w-2xl text-muted">We ask {engineNames.join(', ')} the questions your customers ask, every week, and check whether you are mentioned in the answer or cited as a source.</p>
        </div>
        <ActionButton action={async () => { 'use server'; return runNow(id); }} label={running ? 'Check running…' : 'Run check now'} pending="Starting…" />
      </div>
      {!profile && <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">Fill in your <Link href={`/app/sites/${id}/brand`} className="underline">Brand Memory</Link> first, so we can recognise your business name in AI answers.</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Mentioned in answers" value={rate == null ? '–' : `${rate}%`} note={rate != null && previousRate != null ? `${rate >= previousRate ? '+' : ''}${rate - previousRate} points vs last check` : 'of tracked questions, latest check'} />
        <Stat label="Cited as a source" value={citedRate == null ? '–' : `${citedRate}%`} note="your site linked in the answer" />
        <Stat label="Questions tracked" value={`${prompts.length} / ${MAX_PROMPTS}`} note="checked weekly" />
      </div>

      <section aria-labelledby="prompts">
        <h2 id="prompts" className="text-xl font-semibold">Tracked questions</h2>
        {prompts.length === 0 && <p className="mt-2 text-muted">No questions yet. Add the questions a customer would type into ChatGPT before choosing a business like yours.</p>}
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-white">
          {prompts.map(p => (
            <li key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <p className="font-medium">{p.prompt}</p>
                <form action={removePrompt.bind(null, id, p.id)}><button className="text-sm text-muted hover:text-critical">Remove</button></form>
              </div>
              <div className="mt-3 space-y-2">
                {engineNames.map(engine => {
                  const r = latest.get(`${p.id}:${engine}`);
                  return (
                    <details key={engine} className="rounded-md bg-paper px-3 py-2">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
                        <span className="w-24 font-medium">{engine}</span>
                        {r ? <><Badge on={r.mentioned} yes="Mentioned" no="Not mentioned" /><Badge on={r.cited} yes="Cited" no="Not cited" /><span className="text-xs text-muted">{r.createdAt.toLocaleDateString('en-GB')}</span></> : <span className="text-xs text-muted">Not checked yet</span>}
                      </summary>
                      {r?.excerpt && <p className="mt-2 text-sm text-muted">“{r.excerpt}…”</p>}
                      {r && (r.citedUrls as string[]).length > 0 && <p className="mt-1 text-xs">Cited: {(r.citedUrls as string[]).join(', ')}</p>}
                    </details>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {prompts.length < MAX_PROMPTS && (
        <section className="grid gap-6 rounded-xl border border-line bg-white p-6 lg:grid-cols-2">
          <div>
            <h2 className="font-semibold">Add questions</h2>
            <p className="mb-3 mt-1 text-sm text-muted">One per line. Write them the way a customer would ask.</p>
            <AuthForm action={addPrompts.bind(null, id)} submit="Add questions" pending="Adding…" fields={[{ name: 'prompts', label: 'Questions', textarea: true, defaultValue: suggestions.slice(0, 3).join('\n') }]} />
          </div>
          {suggestions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Ideas based on your Brand Memory</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted">{suggestions.map(x => <li key={x}>· {x}</li>)}</ul>
            </div>
          )}
        </section>
      )}
      <p className="text-xs text-muted">Answers come from the AI providers&apos; web-connected APIs. They are close to, but not always identical to, what people see in the ChatGPT, Perplexity or Gemini apps, and answers change from day to day.</p>
    </div>
  );
}

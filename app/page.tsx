import Link from 'next/link';
import { AuditForm } from '@/components/audit-form';
import { ScoreRing } from '@/components/score-ring';

export const metadata = {
  title: 'SEO Agent: get found on Google and in AI answers',
  description: 'Free 0–100 score for how easily ChatGPT, Claude, Perplexity and Google AI Overviews can find, read and act on your website, plus exactly what to fix.',
};

const engines = ['ChatGPT', 'Claude', 'Perplexity', 'Google AI Overviews', 'Gemini', 'Copilot'];

const bots = [
  { bot: 'OAI-SearchBot', use: 'ChatGPT search', ok: false },
  { bot: 'PerplexityBot', use: 'Perplexity', ok: false },
  { bot: 'Claude-SearchBot', use: 'Claude search', ok: true },
  { bot: 'Googlebot', use: 'Google & AI Overviews', ok: true },
];

const steps = [
  { n: '01', title: 'Audit', body: 'We read up to 500 pages and score two things: how healthy the site is for Google, and how easy it is for AI assistants to use.' },
  { n: '02', title: 'Approve', body: 'Every problem comes with a fix in plain English. The agent writes new titles, descriptions, llms.txt and business data. You approve each one.' },
  { n: '03', title: 'Publish and track', body: 'One click publishes to WordPress, with rollback. Weekly audits and AI visibility checks show what changed.' },
];

const compare = [
  ['Finds technical SEO problems', true, false, true],
  ['Scores AI readiness (robots.txt, llms.txt, structured data)', false, 'Some', true],
  ['Writes the fixes for you', false, 'Some', true],
  ['Publishes fixes to your site, with rollback', false, false, true],
  ['Tracks whether AI answers mention you', false, true, true],
  ['Google Search Console data in the same place', 'Some', false, true],
  ['Self-serve, no sales call', true, false, true],
] as const;

const faqs = [
  ['What does the AI-readiness score measure?', 'Twenty checks in four groups: whether AI crawlers are allowed in, whether your content is readable without JavaScript, whether AI can confirm who you are, and newer agent standards. It is our own measure based on how these crawlers are documented to work. No AI company publishes an official score.'],
  ['Will this get me mentioned in ChatGPT?', 'Nobody can promise that. What we can do is remove the things that stop AI from reading and trusting your site, and show you week by week whether you are being mentioned.'],
  ['Do you change my website without asking?', 'Never. You approve every change, we check nobody edited the page in between, and every change can be rolled back.'],
  ['I am not on WordPress. Does it still work?', 'Yes. Audits, scores, AI visibility and Search Console work on any site. Fixes and the AI feed come as copy-and-paste blocks.'],
];

const Mark = ({ v }: { v: boolean | string }) => (v === true ? <span className="text-accent">Yes</span> : v === false ? <span className="text-muted">No</span> : <span className="text-warning">{v}</span>);

export default function Home() {
  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-medium text-accent">Free AI-readiness check</p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Get found on Google <span className="text-muted">and</span> in AI answers.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            A free 0–100 score for how easily ChatGPT, Claude, Perplexity and Google AI Overviews can find, read and act on your website. Plus exactly what to fix.
          </p>
          <AuditForm />
        </div>
        <div aria-hidden className="relative">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_20px_60px_-30px_rgba(27,31,29,0.35)]">
            <div className="flex items-center justify-between border-b border-line pb-3 text-sm">
              <span className="font-medium">yetiplumbing.com</span>
              <span className="text-muted">20 pages · 18s</span>
            </div>
            <div className="grid grid-cols-2 gap-4 py-4">
              <ScoreRing score={74} label="Google SEO" sub="3 critical" size={92} />
              <ScoreRing score={38} label="AI readiness" sub="Hard for AI to use" size={92} />
            </div>
            <div className="rounded-lg bg-paper p-3">
              <p className="text-xs font-medium text-muted">Fix these first</p>
              <ol className="mt-2 space-y-1.5 text-sm">
                <li><span className="font-mono text-xs text-muted">01</span> Allow ChatGPT and Perplexity in robots.txt <span className="text-accent">+16</span></li>
                <li><span className="font-mono text-xs text-muted">02</span> Add business structured data <span className="text-accent">+10</span></li>
                <li><span className="font-mono text-xs text-muted">03</span> Publish an llms.txt file <span className="text-accent">+6</span></li>
              </ol>
            </div>
            <table className="mt-4 w-full text-left text-xs">
              <tbody className="divide-y divide-line">
                {bots.map(b => (
                  <tr key={b.bot}><td className="py-1.5 font-mono">{b.bot}</td><td className="text-muted">{b.use}</td>
                    <td className="text-right"><span className={`rounded px-1.5 py-0.5 font-medium ${b.ok ? 'bg-accent/10 text-accent' : 'bg-critical/10 text-critical'}`}>{b.ok ? 'Allowed' : 'Blocked'}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-center text-xs text-muted">Example report</p>
        </div>
      </section>

      {/* Engines */}
      <section aria-label="AI assistants checked" className="border-y border-line py-6">
        <p className="text-center text-sm text-muted">Checks what these assistants can read on your site</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-x-8 gap-y-2 text-lg font-medium tracking-tight">
          {engines.map(e => <li key={e}>{e}</li>)}
        </ul>
      </section>

      {/* Two scores */}
      <section className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Two scores. One report. Fixes included.</h2>
          <p className="mt-3 text-muted">Search is splitting in two: the blue links, and the answers AI writes above them. Most tools only check one. You need both.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-6">
            <p className="font-mono text-xs text-muted">SCORE 1</p>
            <h3 className="mt-1 text-xl font-semibold">Google SEO health</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li>Pages hidden from Google, broken pages, redirect chains</li>
              <li>Missing or duplicate titles and descriptions</li>
              <li>Headings, thin content, image alt text</li>
              <li>HTTPS, mobile, sitemap, structured data</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-ink bg-ink p-6 text-white">
            <p className="font-mono text-xs text-white/60">SCORE 2</p>
            <h3 className="mt-1 text-xl font-semibold">AI readiness</h3>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              <li>Which AI crawlers your robots.txt lets in</li>
              <li>Content AI can read without running JavaScript</li>
              <li>llms.txt, business structured data, update dates</li>
              <li>Clear identity, contact details, agent standards</li>
            </ul>
          </div>
        </div>
      </section>

      {/* robots.txt story */}
      <section className="overflow-hidden rounded-3xl bg-ink px-6 py-12 text-white sm:px-12">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Many sites block AI by accident.</h2>
            <p className="mt-4 text-white/70">A security plugin, a copied robots.txt or a hosting default can quietly shut out ChatGPT and Perplexity. When someone asks an AI for a business like yours, you are simply not in the answer. We show you exactly which crawlers are blocked and the two lines that fix it.</p>
          </div>
          <div className="grid gap-3 font-mono text-sm">
            <pre className="rounded-xl bg-white/5 p-4 text-white/80"><span className="text-critical">✕ before</span>{'\n'}User-agent: *{'\n'}Disallow: /wp-admin/{'\n'}{'\n'}User-agent: OAI-SearchBot{'\n'}Disallow: /</pre>
            <pre className="rounded-xl bg-white/10 p-4"><span className="text-[#7fd1a4]">✓ after</span>{'\n'}User-agent: *{'\n'}Disallow: /wp-admin/{'\n'}{'\n'}User-agent: OAI-SearchBot{'\n'}Allow: /</pre>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {steps.map(s => (
            <li key={s.n} className="border-t-2 border-ink pt-4">
              <span className="font-mono text-sm text-muted">{s.n}</span>
              <h3 className="mt-1 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Feature rows */}
      <section className="space-y-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Brand Memory: AI only says what you confirmed.</h2>
            <p className="mt-3 text-muted">Confirm your name, services, area and hours once. That becomes your llms.txt and business structured data, and it is the only source the agent writes from. No invented prices, no made-up awards.</p>
          </div>
          <pre aria-hidden className="overflow-hidden rounded-2xl border border-line bg-white p-5 text-xs leading-relaxed text-muted">{`# Yeti Plumbing

> Licensed plumbers serving Kathmandu Valley since 2012.

- Serves: Kathmandu Valley
- Phone: +977 1 400 0000
- Hours: Mo-Su 07:00-21:00

## Services
- Leak and burst pipe repair
- Water heater installation`}</pre>
        </div>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="lg:order-2">
            <h2 className="text-2xl font-semibold tracking-tight">See if AI recommends you, every week.</h2>
            <p className="mt-3 text-muted">Track the questions your customers ask, like “best plumber in Kathmandu”. We ask AI engines each week and show whether you are mentioned, whether your site is cited, and what the answer said.</p>
          </div>
          <div aria-hidden className="rounded-2xl border border-line bg-white p-5 text-sm lg:order-1">
            {[['Best plumber in Kathmandu?', true, true], ['Emergency plumber near Lalitpur', true, false], ['Water heater installation cost', false, false]].map(([q, m, c]) => (
              <div key={String(q)} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 last:border-0">
                <span>{q}</span>
                <span className="flex gap-1.5 text-xs">
                  <span className={`rounded px-1.5 py-0.5 ${m ? 'bg-accent/10 text-accent' : 'bg-line text-muted'}`}>{m ? 'Mentioned' : 'Not mentioned'}</span>
                  <span className={`rounded px-1.5 py-0.5 ${c ? 'bg-accent/10 text-accent' : 'bg-line text-muted'}`}>{c ? 'Cited' : 'Not cited'}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Fixes you approve. Changes you can undo.</h2>
            <p className="mt-3 text-muted">The agent writes a better title and description for each page, checks the length and that no numbers were invented, and publishes to WordPress when you click. If someone edited the page in the meantime, it stops instead of overwriting.</p>
          </div>
          <div aria-hidden className="rounded-2xl border border-line bg-white p-5 text-sm">
            <p className="text-xs text-muted">Title · /services/leak-repair</p>
            <p className="mt-2 text-muted line-through decoration-line">Services</p>
            <p className="mt-1">Leak & Burst Pipe Repair in Kathmandu | Yeti Plumbing <span className="font-mono text-xs text-muted">(53)</span></p>
            <div className="mt-4 flex gap-2">
              <span className="rounded-md bg-ink px-3 py-1.5 text-xs text-white">Publish to WordPress</span>
              <span className="rounded-md border border-line px-3 py-1.5 text-xs">Roll back</span>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section>
        <h2 className="text-3xl font-semibold tracking-tight">Everything in one place</h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line"><tr><th className="p-4 font-normal text-muted"></th><th className="p-4 font-medium">Typical SEO audit tools</th><th className="p-4 font-medium">AI visibility tools</th><th className="bg-ink p-4 font-medium text-white">SEO Agent</th></tr></thead>
            <tbody className="divide-y divide-line">
              {compare.map(([label, a, b, c]) => (
                <tr key={label}><td className="p-4">{label}</td><td className="p-4"><Mark v={a} /></td><td className="p-4"><Mark v={b} /></td><td className="bg-ink/[0.03] p-4 font-medium"><Mark v={c} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing + FAQ */}
      <section className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
        <div className="self-start rounded-2xl border border-line bg-white p-8">
          <p className="text-sm text-muted">One plan</p>
          <p className="mt-2 font-mono text-5xl">$49<span className="text-lg text-muted"> / site / month</span></p>
          <p className="mt-3 text-muted">Weekly audits of 500 pages, both scores, AI fixes, WordPress publishing, AI feed, visibility tracking, Search Console and monthly reports.</p>
          <Link href="/signup" className="mt-6 inline-block rounded-md bg-ink px-5 py-3 font-medium text-white hover:bg-accent">Start 7-day free trial</Link>
          <p className="mt-3 text-xs text-muted">No card needed. <Link href="/pricing" className="underline">Full pricing</Link></p>
        </div>
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
          <dl className="mt-4 divide-y divide-line border-y border-line">
            {faqs.map(([q, a]) => <div key={q} className="py-5"><dt className="font-medium">{q}</dt><dd className="mt-2 text-muted">{a}</dd></div>)}
          </dl>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white px-6 py-12 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">How ready is your site for AI?</h2>
        <p className="mt-2 text-muted">Find out in under a minute. Free, no account.</p>
        <div className="mx-auto max-w-xl text-left"><AuditForm /></div>
      </section>
    </div>
  );
}

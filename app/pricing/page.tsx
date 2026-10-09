import Link from 'next/link';
import { PRICE_PER_SITE_USD, TRIAL_DAYS } from '@/lib/plans';

export const metadata = { title: 'Pricing · SEO Agent' };

const included = [
  'Full audit of up to 500 pages, every week',
  '23 checks explained in plain English, with the pages affected',
  'AI-written titles, meta descriptions and headings for each page',
  'One-click publishing to WordPress, with rollback',
  'Google Search Console data: clicks, queries, keywords close to page one',
  'Monthly email report and alerts when something breaks',
];

const faqs = [
  ['Do you guarantee rankings?', 'No, and nobody honest can. We find and fix the problems that hold pages back and show you what changed.'],
  ['What happens if I cancel?', 'Your account stays active until the end of the period. Anything already published to your site stays there.'],
  ['Do you change my site without asking?', 'Never. Every fix is shown to you first, and you can roll it back.'],
];

export default function PricingPage() {
  return (
    <div className="max-w-3xl space-y-12">
      <section>
        <h1 className="text-4xl font-semibold tracking-tight">One price per website.</h1>
        <p className="mt-3 text-lg text-muted">${PRICE_PER_SITE_USD} a month per site, or ${PRICE_PER_SITE_USD * 10} a year (2 months free). {TRIAL_DAYS}-day free trial, no card needed.</p>
      </section>
      <section className="rounded-md border border-line bg-white p-6">
        <p className="font-mono text-5xl">${PRICE_PER_SITE_USD}<span className="text-lg text-muted"> / site / month</span></p>
        <ul className="mt-6 space-y-2">
          {included.map(i => <li key={i} className="flex gap-2"><span aria-hidden className="text-accent">✓</span>{i}</li>)}
        </ul>
        <Link href="/signup" className="mt-6 inline-block rounded-md bg-ink px-5 py-3 font-medium text-white hover:bg-accent">Start free trial</Link>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Questions</h2>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {faqs.map(([q, a]) => <div key={q} className="py-4"><dt className="font-medium">{q}</dt><dd className="mt-1 text-muted">{a}</dd></div>)}
        </dl>
      </section>
    </div>
  );
}

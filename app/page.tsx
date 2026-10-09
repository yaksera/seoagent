import { AuditForm } from '@/components/audit-form';

const checks = [
  ['Pages Google can\'t see', 'noindex tags, broken pages, server errors, redirect chains'],
  ['Titles and descriptions', 'missing, duplicated, too long or too short'],
  ['Headings and content', 'missing H1s, thin pages, pages nothing links to'],
  ['Technical basics', 'HTTPS, mobile viewport, sitemap, structured data, alt text'],
];

export default function Home() {
  return (
    <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
      <section>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">See what&apos;s stopping your site from showing up on Google.</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Enter your website. We read your pages, explain each problem in plain English, and write fixed titles, descriptions and headings you can paste straight in.
        </p>
        <AuditForm />
      </section>
      <section aria-labelledby="checks" className="border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        <h2 id="checks" className="text-sm font-medium text-muted">What gets checked</h2>
        <dl className="mt-4 divide-y divide-line">
          {checks.map(([title, detail]) => (
            <div key={title} className="py-3">
              <dt className="font-medium">{title}</dt>
              <dd className="text-sm text-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export const metadata = { title: 'Our crawler · SEO Agent' };

export default function BotPage() {
  return (
    <article className="max-w-2xl space-y-4 [&_p]:text-muted">
      <h1 className="text-3xl font-semibold tracking-tight">About SEOAgentBot</h1>
      <p>SEOAgentBot visits websites when their owner, or someone running a free audit, asks us to check them for SEO problems.</p>
      <ul className="ml-5 list-disc space-y-1 text-muted">
        <li>It identifies itself with the user agent <code className="text-ink">SEOAgentBot/1.0</code>.</li>
        <li>It follows robots.txt rules for that user agent.</li>
        <li>It reads at most a few pages at a time with a pause between requests, and stops after the page limit for the audit.</li>
        <li>It only reads public pages. It does not log in, submit forms or download files.</li>
      </ul>
      <p>To block it, add this to your robots.txt:</p>
      <pre className="rounded-md border border-line bg-white p-3 text-sm">User-agent: SEOAgentBot{'\n'}Disallow: /</pre>
      <p>Questions or problems: abuse@your-domain.com</p>
    </article>
  );
}

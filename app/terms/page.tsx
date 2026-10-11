import { LegalPage } from '@/components/legal';

export const metadata = { title: 'Terms · SEO Agent' };

export default function Terms() {
  return (
    <LegalPage title="Terms of service" updated="October 2026">
      <h2>The service</h2>
      <p>SEO Agent audits websites, suggests search engine optimisation changes and, when you connect a site and approve a change, publishes it for you. We do not guarantee any ranking, traffic or revenue result.</p>
      <h2>Your sites</h2>
      <p>Only add websites you own or are authorised to manage. You are responsible for changes you approve. Every published change can be rolled back from your dashboard while the site is connected.</p>
      <h2>Billing</h2>
      <ul>
        <li>Plans are billed per website, monthly or yearly, in advance, through Stripe.</li>
        <li>You can cancel at any time; access continues until the end of the paid period. We do not refund partial periods unless required by law.</li>
        <li>Changes already published to your site stay after you cancel.</li>
      </ul>
      <h2>Acceptable use</h2>
      <p>Do not use the service to crawl sites you are not allowed to, to overload any website, or to break any law or search engine guideline. We may suspend accounts that do.</p>
      <h2>AI-generated content</h2>
      <p>Suggestions are written by AI models and checked by automated rules, but they can be wrong. Review each suggestion before publishing it.</p>
      <h2>Liability</h2>
      <p>To the extent the law allows, our total liability is limited to the amount you paid in the 12 months before the claim.</p>
      <h2>Contact</h2>
      <p>Questions about these terms: support@your-domain.com.</p>
    </LegalPage>
  );
}

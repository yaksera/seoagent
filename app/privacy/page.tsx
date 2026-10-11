import { LegalPage } from '@/components/legal';

export const metadata = { title: 'Privacy · SEO Agent' };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="October 2026">
      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address and a hashed password.</li>
        <li>Websites you add and the public pages we crawl on them.</li>
        <li>If you connect them: an encrypted WordPress Application Password and an encrypted Google refresh token (read-only Search Console access), plus the search performance data Google returns.</li>
        <li>Billing details are handled by Stripe; we never see your full card number.</li>
        <li>Security logs: sign-ins, IP addresses and important account actions.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To run audits, write and publish the changes you approve, send reports and alerts you have switched on, bill you and keep the service secure. We do not sell your data or use it for advertising.</p>
      <h2>Processors</h2>
      <p>Hosting and database provider, Stripe (payments), Resend (email), OpenRouter and the AI model providers it routes to (page text is sent to write suggestions), and Google (Search Console, only if you connect it).</p>
      <h2>Google user data</h2>
      <p>Search Console data is used only to show your own site&apos;s search performance inside SEO Agent. It is never shared, sold or used to train AI models. Disconnecting Google deletes the stored data.</p>
      <h2>Retention and deletion</h2>
      <p>Free audits are deleted after 30 days. When you delete your account, all your data is permanently removed within 30 days. You can request a copy of your data at any time.</p>
      <h2>Contact</h2>
      <p>privacy@your-domain.com</p>
    </LegalPage>
  );
}

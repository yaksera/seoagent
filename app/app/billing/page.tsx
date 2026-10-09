import { and, count, eq, isNull } from 'drizzle-orm';
import { AuthForm, btnSecondaryCls } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { PRICE_PER_SITE_USD, planLabel } from '@/lib/plans';
import { getStripe } from '@/lib/stripe';
import { changeSites, openPortal, startCheckout } from './actions';
import { CheckoutForm } from './checkout-form';

export const dynamic = 'force-dynamic';

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const { success } = await searchParams;
  const s = await requireUser();
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.sites).where(and(eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  const configured = Boolean(getStripe() && process.env.STRIPE_PRICE_MONTHLY);
  const subscribed = Boolean(s.account.stripeSubscriptionId) && s.account.plan !== 'canceled';

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted">{planLabel(s.account)} · {n} site{n === 1 ? '' : 's'} in use{subscribed && ` of ${s.account.siteQuantity} paid`}</p>
        {s.account.currentPeriodEnd && <p className="text-sm text-muted">Current period ends {s.account.currentPeriodEnd.toLocaleDateString('en-GB')}</p>}
      </div>
      {success && <p role="status" className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">Thanks! Your subscription is being activated. This page updates within a few seconds.</p>}
      {!configured && <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">Payments aren&apos;t set up on this server yet (missing Stripe keys).</p>}

      {!subscribed ? (
        <section className="rounded-md border border-line bg-white p-5">
          <h2 className="font-semibold">Choose a plan</h2>
          <p className="mt-1 text-sm text-muted">${PRICE_PER_SITE_USD} per website per month, or 2 months free when paying yearly. Cancel anytime; fixes already published stay on your site.</p>
          <div className="mt-4"><CheckoutForm action={startCheckout} defaultSites={Math.max(1, n)} /></div>
        </section>
      ) : (
        <>
          <section className="rounded-md border border-line bg-white p-5">
            <h2 className="font-semibold">Number of sites</h2>
            <div className="mt-3 max-w-xs">
              <AuthForm action={changeSites} submit="Update" pending="Updating…" fields={[{ name: 'sites', label: 'Paid sites', type: 'number', defaultValue: String(s.account.siteQuantity) }]} />
            </div>
          </section>
          <section className="rounded-md border border-line bg-white p-5">
            <h2 className="font-semibold">Card, invoices and cancellation</h2>
            <p className="mb-3 mt-1 text-sm text-muted">Managed securely by Stripe.</p>
            <form action={openPortal}><button className={btnSecondaryCls}>Open billing portal</button></form>
          </section>
        </>
      )}
    </div>
  );
}

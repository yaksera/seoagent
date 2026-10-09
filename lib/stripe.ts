import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { getDb, schema } from './db';

const g = globalThis as unknown as { __stripe?: Stripe };

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  g.__stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return g.__stripe;
}

export const priceFor = (interval: 'month' | 'year') => (interval === 'year' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY);

const PLAN: Record<string, 'active' | 'past_due' | 'canceled'> = {
  active: 'active', trialing: 'active', past_due: 'past_due', unpaid: 'past_due',
  canceled: 'canceled', incomplete_expired: 'canceled', incomplete: 'past_due', paused: 'past_due',
};

// Copies the subscription state from Stripe into our accounts table (Stripe is the source of truth).
export async function syncSubscription(sub: Stripe.Subscription) {
  const db = await getDb();
  const accountId = sub.metadata.accountId;
  const item = sub.items.data[0];
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const values = {
    plan: PLAN[sub.status] ?? 'past_due',
    siteQuantity: item?.quantity ?? 1,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  };
  if (accountId) await db.update(schema.accounts).set(values).where(eq(schema.accounts.id, accountId));
  else await db.update(schema.accounts).set(values).where(eq(schema.accounts.stripeCustomerId, values.stripeCustomerId));
}

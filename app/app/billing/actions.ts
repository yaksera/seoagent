'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { FormState } from '@/app/(auth)/actions';
import { logAction, requireUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { appUrl } from '@/lib/email';
import { getStripe, priceFor, syncSubscription } from '@/lib/stripe';

const input = z.object({ sites: z.coerce.number().int().min(1).max(100), interval: z.enum(['month', 'year']) });

export async function startCheckout(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireUser();
  const stripe = getStripe();
  const parsed = input.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Choose between 1 and 100 sites.' };
  const price = priceFor(parsed.data.interval);
  if (!stripe || !price) return { error: 'Payments are not set up yet. Add the Stripe keys to the server.' };
  if (s.account.plan === 'active' && s.account.stripeSubscriptionId) return { error: 'You already have a subscription. Change the number of sites below.' };

  let customer = s.account.stripeCustomerId;
  if (!customer) {
    const c = await stripe.customers.create({ email: s.user.email, name: s.account.name, metadata: { accountId: s.account.id } });
    customer = c.id;
    const db = await getDb();
    await db.update(schema.accounts).set({ stripeCustomerId: customer }).where(eq(schema.accounts.id, s.account.id));
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: s.account.id,
    line_items: [{ price, quantity: parsed.data.sites }],
    subscription_data: { metadata: { accountId: s.account.id } },
    automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
    customer_update: process.env.STRIPE_AUTOMATIC_TAX === 'true' ? { address: 'auto' } : undefined,
    allow_promotion_codes: true,
    success_url: `${appUrl()}/app/billing?success=1`,
    cancel_url: `${appUrl()}/app/billing`,
  });
  redirect(session.url!);
}

export async function openPortal() {
  const s = await requireUser();
  const stripe = getStripe();
  if (!stripe || !s.account.stripeCustomerId) redirect('/app/billing');
  const portal = await stripe.billingPortal.sessions.create({ customer: s.account.stripeCustomerId, return_url: `${appUrl()}/app/billing` });
  redirect(portal.url);
}

export async function changeSites(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireUser();
  const stripe = getStripe();
  const sites = z.coerce.number().int().min(1).max(100).safeParse(form.get('sites'));
  if (!sites.success) return { error: 'Choose between 1 and 100 sites.' };
  if (!stripe || !s.account.stripeSubscriptionId) return { error: 'No active subscription.' };

  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.sites).where(and(eq(schema.sites.accountId, s.account.id), isNull(schema.sites.deletedAt)));
  if (sites.data < n) return { error: `You have ${n} sites. Remove some before lowering to ${sites.data}.` };

  const sub = await stripe.subscriptions.retrieve(s.account.stripeSubscriptionId);
  const updated = await stripe.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0].id, quantity: sites.data }],
    proration_behavior: 'create_prorations',
  });
  await syncSubscription(updated);
  await logAction('subscription_quantity_changed', { accountId: s.account.id, userId: s.user.id, meta: { from: sub.items.data[0].quantity, to: sites.data } });
  return { ok: `Updated to ${sites.data} site${sites.data === 1 ? '' : 's'}. The difference is prorated on your next invoice.` };
}

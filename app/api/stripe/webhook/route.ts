import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { logAction } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { appUrl, sendEmail } from '@/lib/email';
import { getStripe, syncSubscription } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response('Stripe not configured', { status: 503 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get('stripe-signature') ?? '', secret);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  const db = await getDb();
  // Stripe retries deliveries; process each event once.
  const [fresh] = await db.insert(schema.stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning();
  if (!fresh) return Response.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.mode === 'subscription' && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === 'string' ? s.subscription : s.subscription.id);
          await syncSubscription(sub);
          await logAction('subscription_started', { accountId: sub.metadata.accountId, meta: { quantity: sub.items.data[0]?.quantity } });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object);
        break;
      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const customer = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
        if (customer) {
          const rows = await db.select({ email: schema.users.email, accountId: schema.accounts.id }).from(schema.accounts)
            .innerJoin(schema.users, eq(schema.users.accountId, schema.accounts.id)).where(eq(schema.accounts.stripeCustomerId, customer));
          for (const r of rows) {
            await sendEmail(r.email, 'Your SEO Agent payment failed', `We couldn't take your last payment. Update your card to keep your weekly audits running:\n${appUrl()}/app/billing`);
          }
          if (rows[0]) await logAction('payment_failed', { accountId: rows[0].accountId });
        }
        break;
      }
    }
  } catch (e) {
    // Let Stripe retry: forget the event so the retry isn't treated as a duplicate.
    await db.delete(schema.stripeEvents).where(eq(schema.stripeEvents.id, event.id));
    throw e;
  }
  return Response.json({ received: true });
}

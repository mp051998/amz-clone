import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { confirmCheckoutSession, releaseSession } from '@/lib/data/payments';
import { DataError } from '@/lib/data/errors';

/**
 * POST /api/v1/webhooks/stripe — Stripe's server-to-server notifications, so an
 * order is confirmed even if the shopper never makes it back to the success
 * page, and reserved stock is released when a Checkout Session expires unpaid.
 * Requests are authenticated by Stripe's signature (STRIPE_WEBHOOK_SECRET).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return Response.json({ error: { code: 'payments_unavailable' } }, { status: 503 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return Response.json({ error: { code: 'invalid_signature' } }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return Response.json({ error: { code: 'invalid_signature' } }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status === 'paid') await confirmCheckoutSession(session.id);
        break;
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        await releaseSession(event.data.object.id);
        break;
    }
  } catch (err) {
    // domain outcomes (e.g. amount_mismatch) are final — acknowledge so Stripe stops retrying
    if (err instanceof DataError && err.status < 500) {
      console.error('[stripe webhook]', event.type, err.code, err.detail ?? '');
      return Response.json({ received: true, outcome: err.code });
    }
    throw err;
  }
  return Response.json({ received: true });
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { setCartQty } from '@/lib/data/cart';
import { getOrder, placeOrder } from '@/lib/data/orders';
import { startCardCheckout } from '@/lib/data/payments';
import { POST } from '@/app/api/v1/webhooks/stripe/route';
import { admin, deleteUser, newUser, pickProduct, stockOf, US_SHIPPING, type TestUser } from './helpers';

// Talks to Stripe in test mode: creates (then expires) real Checkout Sessions.
const SECRET = 'whsec_integration_test';

function signed(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const header = stripe!.webhooks.generateTestHeaderString({ payload, secret });
  return new NextRequest('http://localhost/api/v1/webhooks/stripe', {
    method: 'POST',
    body: payload,
    headers: { 'stripe-signature': header, 'content-type': 'application/json' },
  });
}

const sessionEvent = (type: string, session: object) => ({
  id: `evt_${crypto.randomUUID()}`,
  object: 'event',
  type,
  data: { object: { object: 'checkout.session', ...session } },
});

describe.runIf(stripe)('stripe webhook', () => {
  let buyer: TestUser;
  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    buyer = await newUser('Card Buyer');
  });
  afterAll(async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    await deleteUser(buyer);
  });

  async function pendingCardOrder() {
    const p = await pickProduct('US', 12);
    // card orders keep the cart until paid, so pin the line to exactly one unit
    await setCartQty(buyer.db, 'US', p.id, 1);
    const order = await placeOrder(buyer.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING });
    const url = await startCardCheckout(order, {
      successUrl: 'http://localhost:3100/checkout/success',
      cancelUrl: 'http://localhost:3100/checkout/cancel',
    });
    const { data } = await admin().from('orders').select('stripe_session_id').eq('id', order.id).single();
    return { p, order, url, sessionId: data!.stripe_session_id! };
  }

  it('rejects unsigned or mis-signed calls', async () => {
    const event = sessionEvent('checkout.session.expired', { id: 'cs_test_x' });
    expect((await POST(signed(event, 'whsec_wrong'))).status).toBe(400);
    const unsigned = new NextRequest('http://localhost/api/v1/webhooks/stripe', { method: 'POST', body: '{}' });
    expect((await POST(unsigned)).status).toBe(400);
  });

  it('a forged "paid" event cannot confirm an order: the session is re-read from Stripe', async () => {
    const { order, url, sessionId } = await pendingCardOrder();
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const res = await POST(signed(sessionEvent('checkout.session.completed', { id: sessionId, payment_status: 'paid' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: 'payment_incomplete' });
    expect((await getOrder(buyer.db, order.id))?.status).toBe('awaiting_payment');
    await stripe!.checkout.sessions.expire(sessionId);
    await POST(signed(sessionEvent('checkout.session.expired', { id: sessionId })));
  });

  it('an expired session releases the reserved stock and cancels the order', async () => {
    const { p, order, sessionId } = await pendingCardOrder();
    const reserved = await stockOf(p.id);
    await stripe!.checkout.sessions.expire(sessionId);
    const res = await POST(signed(sessionEvent('checkout.session.expired', { id: sessionId })));
    expect(res.status).toBe(200);
    expect((await getOrder(buyer.db, order.id))?.status).toBe('cancelled');
    expect(await stockOf(p.id)).toBe(reserved + 1);
    // redelivery is harmless
    expect((await POST(signed(sessionEvent('checkout.session.expired', { id: sessionId })))).status).toBe(200);
    expect(await stockOf(p.id)).toBe(reserved + 1);
    await setCartQty(buyer.db, 'US', p.id, 0);
  });
});

import { beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '../types';

const h = vi.hoisted(() => ({
  sessionId: 'cs_old' as string | null,
  session: null as Record<string, unknown> | null,
  calls: [] as unknown[][],
  created: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('../stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: async (id: string) => {
          h.calls.push(['retrieve', id]);
          return h.session;
        },
        create: async (params: unknown) => {
          h.calls.push(['create']);
          h.created = params;
          return { id: 'cs_new', url: 'https://checkout.stripe.com/c/new' };
        },
        expire: async (id: string) => {
          h.calls.push(['expire', id]);
          if (h.session?.status !== 'open') throw new Error('not open');
        },
      },
    },
  },
}));
vi.mock('../supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_session_id: h.sessionId }, error: null }) }) }) }),
    rpc: async (fn: string) => {
      h.calls.push(['rpc', fn]);
      return { data: fn === 'confirm_order_payment' ? { id: 'ORD-1', status: 'placed' } : null, error: null };
    },
  }),
}));
vi.mock('./refunds', () => ({ refundOrder: async () => {} }));

import { expireCardCheckout, resumeCardCheckout, startCardCheckout } from './payments';

const unpaid = {
  id: 'ORD-1',
  market: 'US',
  currency: 'USD',
  status: 'awaiting_payment',
  paymentMethod: 'card',
  totals: { subtotalMinor: 1000, shipMinor: 0, taxMinor: 0, totalMinor: 1000 },
  items: [{ productId: 'p1', title: 'Kettle', image: '/products/k.jpg', seller: 'Store', unitPriceMinor: 1000, qty: 1 }],
} as unknown as Order;
const urls = { successUrl: 'https://shop.test/checkout/success', cancelUrl: 'https://shop.test/checkout/cancel' };

beforeEach(() => {
  h.sessionId = 'cs_old';
  h.session = null;
  h.calls = [];
});

it('goes back to the Stripe page while it is still open, never a second one', async () => {
  h.session = { id: 'cs_old', status: 'open', url: 'https://checkout.stripe.com/c/old' };
  expect(await resumeCardCheckout(unpaid, urls)).toBe('https://checkout.stripe.com/c/old');
  expect(h.calls).toEqual([['retrieve', 'cs_old']]);
});

it('opens a new page once the old one has lapsed (or there never was one)', async () => {
  h.session = { id: 'cs_old', status: 'expired', payment_status: 'unpaid', url: null };
  expect(await resumeCardCheckout(unpaid, urls)).toBe('https://checkout.stripe.com/c/new');
  expect(h.calls).toEqual([['retrieve', 'cs_old'], ['create'], ['rpc', 'attach_checkout_session']]);

  h.calls = [];
  h.sessionId = null;
  expect(await resumeCardCheckout(unpaid, urls)).toBe('https://checkout.stripe.com/c/new');
  expect(h.calls[0]).toEqual(['create']);
});

it('confirms the order when Stripe says it was paid after all', async () => {
  h.session = { id: 'cs_old', status: 'complete', payment_status: 'paid', amount_total: 1000, currency: 'usd', metadata: { orderId: 'ORD-1' } };
  expect(await resumeCardCheckout(unpaid, urls)).toBeNull();
  expect(h.calls).toContainEqual(['rpc', 'confirm_order_payment']);
  expect(h.calls).not.toContainEqual(['create']);
});

it('only for unpaid card orders', async () => {
  await expect(resumeCardCheckout({ ...unpaid, status: 'placed' }, urls)).rejects.toMatchObject({ code: 'order_not_pending' });
  await expect(resumeCardCheckout({ ...unpaid, paymentMethod: 'cod' }, urls)).rejects.toMatchObject({ code: 'order_not_pending' });
  expect(h.calls).toEqual([]);
});

it('closes the Stripe page on cancel, and shrugs when it isn’t open any more', async () => {
  h.session = { status: 'open' };
  await expireCardCheckout('ORD-1');
  expect(h.calls).toEqual([['expire', 'cs_old']]);
  h.session = { status: 'complete' };
  await expect(expireCardCheckout('ORD-1')).resolves.toBeUndefined();
  h.calls = [];
  h.sessionId = null;
  await expireCardCheckout('ORD-1');
  expect(h.calls).toEqual([]);
});

it('asks Stripe for what the balance didn’t pay, as one line', async () => {
  const split = { ...unpaid, id: 'ORD-2', split: { balanceMinor: 300, chargedMinor: 700 } } as Order;
  await startCardCheckout(split, urls);
  const params = h.created as { line_items: { quantity: number; price_data: { unit_amount: number; product_data: { name: string } } }[] };
  expect(params.line_items).toHaveLength(1);
  expect(params.line_items[0]).toMatchObject({ quantity: 1, price_data: { unit_amount: 700, product_data: { name: 'Order ORD-2, less $3.00 from your balance' } } });

  await startCardCheckout(unpaid, urls);
  expect((h.created as typeof params).line_items[0].price_data.unit_amount).toBe(1000);
});

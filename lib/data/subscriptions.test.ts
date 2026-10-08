import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { DataError } from './errors';
import { cancelSubscription, listSubscriptions, skipSubscription, subscribe, subscribeMethods, subscriptionFor, updateSubscription } from './subscriptions';

const row = {
  id: 's1',
  user_id: 'u1',
  market_id: 'US',
  product_id: 'p1',
  qty: 2,
  every_months: 1,
  next_on: '2026-11-09',
  address_id: 'a1',
  payment_method: 'giftcard',
  status: 'active',
  issue: null,
  issue_on: null,
  last_order_id: '114-1',
  created_at: '2026-10-09T00:00:00Z',
  updated_at: '2026-10-09T00:00:00Z',
  cancelled_at: null,
};

const sub = {
  id: 's1',
  market: 'US',
  productId: 'p1',
  qty: 2,
  everyMonths: 1,
  nextOn: '2026-11-09',
  addressId: 'a1',
  paymentMethod: 'giftcard',
  status: 'active',
  lastOrderId: '114-1',
  createdAt: '2026-10-09T00:00:00Z',
};

/** A client whose reads answer with `reply` (recording each filter) and whose RPCs answer with `rpcReply`. */
function fakeDb(reply: { data: unknown; error: unknown }, rpcReply: { data: unknown; error: unknown } = reply) {
  const filters: [string, unknown][] = [];
  const rpcs: [string, unknown][] = [];
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => (filters.push([k, v]), q),
    order: async () => reply,
    maybeSingle: async () => reply,
  };
  const db = { from: (t: string) => (filters.push(['from', t]), q), rpc: async (fn: string, args: unknown) => (rpcs.push([fn, args]), rpcReply) };
  return { db: db as unknown as Db, filters, rpcs };
}

describe('subscriptions', () => {
  it('lists the active ones in a store, or all with cancelled', async () => {
    const f = fakeDb({ data: [row], error: null });
    expect(await listSubscriptions(f.db, 'US')).toEqual([sub]);
    expect(f.filters).toEqual([['from', 'subscriptions'], ['market_id', 'US'], ['status', 'active']]);
    const all = fakeDb({ data: [{ ...row, status: 'cancelled', cancelled_at: '2026-10-10T00:00:00Z' }], error: null });
    expect(await listSubscriptions(all.db, 'US', { includeCancelled: true })).toEqual([{ ...sub, status: 'cancelled', cancelledAt: '2026-10-10T00:00:00Z' }]);
    expect(all.filters).toEqual([['from', 'subscriptions'], ['market_id', 'US']]);
  });

  it('reads nothing when it cannot read (signed out, or before the migration)', async () => {
    const err = { data: null, error: { code: '42P01', message: 'missing' } };
    expect(await listSubscriptions(fakeDb(err).db, 'US')).toEqual([]);
    expect(await subscriptionFor(fakeDb(err).db, 'p1')).toBeNull();
    expect(await subscribeMethods(fakeDb(err).db, 'US')).toEqual([]);
  });

  it('maps an issue and a deleted address', async () => {
    const f = fakeDb({ data: { ...row, issue: 'payment', issue_on: '2026-11-09', address_id: null }, error: null });
    const s = await subscriptionFor(f.db, 'p1');
    expect(s?.issue).toEqual({ kind: 'payment', on: '2026-11-09' });
    expect(s?.addressId).toBeUndefined();
  });

  it('reads the store’s subscription payment methods', async () => {
    expect(await subscribeMethods(fakeDb({ data: { subscribe_methods: ['upi', 'netbanking'] }, error: null }).db, 'IN')).toEqual(['upi', 'netbanking']);
  });

  it('subscribes, returning the subscription and its first order', async () => {
    const order = { id: '114-1', market_id: 'US', currency: 'USD', status: 'placed', payment_method: 'giftcard', subtotal_minor: 11798, discount_minor: 588, ship_minor: 0, tax_minor: 897, total_minor: 12107, created_at: '2026-10-09T00:00:00Z', items: [{ line_no: 1, product_id: 'p1', title: 'Serum', image: '', seller: 'S', unit_price_minor: 5899, qty: 2, unit_discount_minor: 294, unit_sns_minor: 294, subscription_id: 's1' }] };
    const f = fakeDb({ data: null, error: null }, { data: { subscription: row, order }, error: null });
    const r = await subscribe(f.db, { market: 'US', productId: 'p1', qty: 2, everyMonths: 1, addressId: 'a1', paymentMethod: 'giftcard' });
    expect(r.subscription).toEqual(sub);
    expect(r.order.totals).toMatchObject({ discountMinor: 588, snsMinor: 588, shipMinor: 0 });
    expect(r.order.items[0]).toMatchObject({ subscriptionId: 's1', unitSnsMinor: 294 });
    expect(f.rpcs).toEqual([['subscribe', { p_market: 'US', p_product: 'p1', p_qty: 2, p_every: 1, p_address: 'a1', p_payment_method: 'giftcard' }]]);
  });

  it('sends only what changes', async () => {
    const f = fakeDb({ data: null, error: null }, { data: { ...row, qty: 3 }, error: null });
    expect((await updateSubscription(f.db, 's1', { qty: 3 })).qty).toBe(3);
    await updateSubscription(f.db, 's1', { everyMonths: 2, addressId: 'a2', paymentMethod: 'giftcard' });
    expect(f.rpcs).toEqual([
      ['update_subscription', { p_id: 's1', p_qty: 3 }],
      ['update_subscription', { p_id: 's1', p_every: 2, p_address: 'a2', p_payment_method: 'giftcard' }],
    ]);
  });

  it('skips and cancels through the RPCs', async () => {
    const f = fakeDb({ data: null, error: null }, { data: row, error: null });
    await skipSubscription(f.db, 's1');
    await cancelSubscription(f.db, 's1');
    expect(f.rpcs).toEqual([['skip_subscription', { p_id: 's1' }], ['cancel_subscription', { p_id: 's1' }]]);
  });

  it('raises the database’s refusals as DataErrors', async () => {
    const f = fakeDb({ data: null, error: null }, { data: null, error: { code: 'P0001', message: 'already_subscribed', details: '', hint: '' } });
    const err = await subscribe(f.db, { market: 'US', productId: 'p1', qty: 1, everyMonths: 1, addressId: 'a1', paymentMethod: 'giftcard' }).catch((e) => e);
    expect(err).toBeInstanceOf(DataError);
    expect(err).toMatchObject({ code: 'already_subscribed', status: 409 });
  });
});

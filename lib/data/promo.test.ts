import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { activePromoCodes, checkoutQuote } from './promo';

const cart = (extra: object = {}, lineExtra: object = {}) => ({
  market: 'US', currency: 'USD', free_ship_threshold_minor: 3500, count: 2,
  lines: [{ product: { id: 'a', price_minor: 2000 }, qty: 2, line_total_minor: 4000, in_stock: true, available: true, discount_minor: 0, ...lineExtra }],
  totals: { subtotal_minor: 4000, discount_minor: 0, ship_minor: 0, tax_minor: 0, total_minor: 4000 },
  ...extra,
});

function fakeDb(data: unknown, error: unknown = null) {
  const calls: [string, object][] = [];
  const db = { rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data, error }) } as unknown as Db;
  return { db, calls };
}

it('prices the cart with a code: its part of each line and the totals, and the code itself', async () => {
  const { db, calls } = fakeDb({
    cart: cart(
      { totals: { subtotal_minor: 4000, discount_minor: 400, promo_minor: 400, ship_minor: 0, tax_minor: 0, total_minor: 3600 }, promo: { code: 'SAVE10', percent_off: 10, description: '10% off', category_slug: null } },
      { discount_minor: 400, promo_minor: 400 },
    ),
    promo_error: null,
    promo_error_detail: null,
  });
  const q = await checkoutQuote(db, 'US', 'SAVE10');
  expect(calls).toEqual([['checkout_quote', { p_market: 'US', p_promo_code: 'SAVE10' }]]);
  expect(q.promoError).toBeUndefined();
  expect(q.cart.lines[0]).toMatchObject({ discountMinor: 400, promoMinor: 400 });
  expect(q.cart.totals).toMatchObject({ discountMinor: 400, promoMinor: 400, totalMinor: 3600 });
  expect(q.cart.promo).toEqual({ code: 'SAVE10', percentOff: 10, description: '10% off' });
});

it('prices Buy Now’s product, and says why a code didn’t apply', async () => {
  const { db, calls } = fakeDb({ cart: cart(), promo_error: 'promo_min_spend', promo_error_detail: '5000' });
  const q = await checkoutQuote(db, 'IN', 'STYLE20', { productId: 'k1', qty: 2, protection: true });
  expect(calls[0]).toEqual(['checkout_quote', { p_market: 'IN', p_promo_code: 'STYLE20', p_buy: { product_id: 'k1', qty: 2, protection: true } }]);
  expect(q.promoError).toEqual({ code: 'promo_min_spend', detail: '5000' });
  expect(q.cart.promo).toBeUndefined();
  expect(q.cart.lines[0].promoMinor).toBeUndefined();

  const bare = fakeDb({ cart: cart(), promo_error: 'promo_invalid', promo_error_detail: null });
  expect((await checkoutQuote(bare.db, 'US', 'NOPE')).promoError).toEqual({ code: 'promo_invalid' });
});

it('lists the running promotions, and none before the migration', async () => {
  const { db } = fakeDb([
    { code: 'HOME15', percent_off: 15, category_slug: 'home-kitchen', category_name: 'Home & Kitchen', min_spend_minor: 2500, description: '15% off home', ends_at: '2026-10-31T00:00:00Z' },
    { code: 'SAVE10', percent_off: 10, category_slug: null, category_name: null, min_spend_minor: 5000, description: '10% off', ends_at: null },
  ]);
  expect(await activePromoCodes(db, 'US')).toEqual([
    { code: 'HOME15', percentOff: 15, description: '15% off home', category: { slug: 'home-kitchen', name: 'Home & Kitchen' }, minSpendMinor: 2500, endsAt: '2026-10-31T00:00:00Z' },
    { code: 'SAVE10', percentOff: 10, description: '10% off', minSpendMinor: 5000 },
  ]);
  expect(await activePromoCodes(fakeDb(null, { message: 'function does not exist' }).db, 'US')).toEqual([]);
});

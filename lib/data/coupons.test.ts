import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { couponFor, couponPercents, couponUnitSavings } from './coupons';
import { toCart } from './map';

type Reply = { data: unknown; error: unknown };

/** A client whose coupons and coupon_clips reads answer with the given replies. */
function fakeDb(replies: Record<string, Reply>) {
  const tables: string[] = [];
  const db = {
    from: (table: string) => {
      tables.push(table);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in']) q[m] = () => q;
      q.maybeSingle = async () => replies[table];
      q.then = (resolve: (r: Reply) => unknown) => resolve(replies[table]);
      return q;
    },
  };
  return { db: db as unknown as Db, tables };
}

it('takes the percent off a unit, rounded like the database', () => {
  expect(couponUnitSavings(2999, 15)).toBe(450); // 449.85
  expect(couponUnitSavings(1999, 10)).toBe(200); // 199.9
  expect(couponUnitSavings(1000, 5)).toBe(50);
});

it('reads a coupon and whether the caller applied it', async () => {
  const clipped = fakeDb({ coupons: { data: { percent_off: 20 }, error: null }, coupon_clips: { data: { product_id: 'p1' }, error: null } });
  expect(await couponFor(clipped.db, 'p1', true)).toEqual({ percentOff: 20, clipped: true });

  const signedOut = fakeDb({ coupons: { data: { percent_off: 20 }, error: null } });
  expect(await couponFor(signedOut.db, 'p1', false)).toEqual({ percentOff: 20, clipped: false });
  expect(signedOut.tables).toEqual(['coupons']);

  expect(await couponFor(fakeDb({ coupons: { data: null, error: null }, coupon_clips: { data: null, error: null } }).db, 'p1', true)).toBeNull();
  // before the migration
  expect(await couponFor(fakeDb({ coupons: { data: null, error: { code: '42P01', message: 'missing' } } }).db, 'p1', false)).toBeNull();
});

it('looks up coupons for a page of products', async () => {
  const { db } = fakeDb({ coupons: { data: [{ product_id: 'a', percent_off: 10 }], error: null } });
  expect(await couponPercents(db, ['a', 'b'])).toEqual(new Map([['a', 10]]));
  const none = fakeDb({});
  expect(await couponPercents(none.db, [])).toEqual(new Map());
  expect(none.tables).toEqual([]);
});

it('maps cart coupons and the discount (absent before the migration)', () => {
  const line = { product: { id: 'a', price_minor: 2000 }, qty: 2, line_total_minor: 4000, in_stock: true, available: true };
  const cart = toCart({
    market: 'US', currency: 'USD', free_ship_threshold_minor: 3500, count: 2,
    lines: [{ ...line, coupon: { percent_off: 10, clipped: true }, discount_minor: 400 }],
    totals: { subtotal_minor: 4000, discount_minor: 400, ship_minor: 0, tax_minor: 288, total_minor: 3888 },
  });
  expect(cart.lines[0]).toMatchObject({ coupon: { percentOff: 10, clipped: true }, discountMinor: 400 });
  expect(cart.totals.discountMinor).toBe(400);

  const before = toCart({
    market: 'US', currency: 'USD', free_ship_threshold_minor: 3500, count: 2,
    lines: [line],
    totals: { subtotal_minor: 4000, ship_minor: 0, tax_minor: 320, total_minor: 4320 },
  });
  expect(before.lines[0].coupon).toBeUndefined();
  expect(before.lines[0].discountMinor).toBe(0);
  expect(before.totals.discountMinor).toBe(0);
});

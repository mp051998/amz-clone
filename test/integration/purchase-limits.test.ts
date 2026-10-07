import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart } from '@/lib/data/cart';
import { DataError, unwrap } from '@/lib/data/errors';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { purchaseAllowance } from '@/lib/data/purchase-limits';
import { admin, anon, deleteUser, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

let shopper: TestUser;
let other: TestUser;
let limited: string;
let open: string;

const codeOf = async (p: PromiseLike<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
};

const setLimit = async (id: string, limit: number | null) => {
  const { error } = await admin().from('products').update({ max_per_customer: limit }).eq('id', id);
  if (error) throw error;
};

const buy = (u: TestUser, productId: string, qty: number) =>
  placeOrder(u.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING, buyNow: { productId, qty } });

beforeAll(async () => {
  // US offsets 111–112 are this file's
  limited = (await pickProduct('US', 111)).id;
  open = (await pickProduct('US', 112)).id;
  await setLimit(limited, 2);
  shopper = await newUser('Limit Shopper');
  other = await newUser('Other Shopper');
});

afterAll(async () => {
  await setLimit(limited, null);
  await deleteUser(shopper);
  await deleteUser(other);
});

describe('purchase limits', () => {
  it('show on the product, and only for the signed-in shopper’s own orders', async () => {
    const { data } = await anon().from('catalog_products').select('id, max_per_customer').in('id', [limited, open]);
    expect(Object.fromEntries((data ?? []).map((r) => [r.id, r.max_per_customer]))).toEqual({ [limited]: 2, [open]: null });
    // signed out there's no allowance to ask for
    expect(await codeOf(anon().rpc('purchase_allowance', { p_market: 'US', p_product_ids: [limited] }).then(unwrap))).toMatch(/^forbidden:/);

    const fresh = await purchaseAllowance(shopper.db, 'US', [limited, open]);
    expect([...fresh.keys()]).toEqual([limited]);
    expect(fresh.get(limited)).toEqual({ limit: 2, bought: 0, left: 2 });
    // another store's id isn't this store's product
    expect((await purchaseAllowance(shopper.db, 'IN', [limited])).size).toBe(0);
  });

  it('stop an order past the limit, counting what the shopper has bought before', async () => {
    expect(await codeOf(buy(shopper, limited, 3))).toBe(`purchase_limit:${limited}`);
    const first = await buy(shopper, limited, 1);
    expect((await purchaseAllowance(shopper.db, 'US', [limited])).get(limited)).toEqual({ limit: 2, bought: 1, left: 1 });
    expect(await codeOf(buy(shopper, limited, 2))).toBe(`purchase_limit:${limited}`);

    // the cart's the same: a line past the limit stops the whole order
    await addToCart(shopper.db, 'US', limited, 2);
    await addToCart(shopper.db, 'US', open, 1);
    expect(await codeOf(placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING }))).toBe(`purchase_limit:${limited}`);

    // other shoppers have their own limit, and products without one are as before
    expect(await codeOf(buy(other, limited, 2))).toBe('ok');
    expect(await codeOf(buy(shopper, open, 5))).toBe('ok');

    // a cancelled order no longer counts against it
    await cancelOrder(shopper.db, first.id);
    expect((await purchaseAllowance(shopper.db, 'US', [limited])).get(limited)).toEqual({ limit: 2, bought: 0, left: 2 });
    const placed = await placeOrder(shopper.db, 'US', { paymentMethod: 'giftcard', shipping: US_SHIPPING });
    expect(placed.items.find((it) => it.productId === limited)?.qty).toBe(2);
    expect((await purchaseAllowance(shopper.db, 'US', [limited])).get(limited)).toEqual({ limit: 2, bought: 2, left: 0 });
    expect(await codeOf(buy(shopper, limited, 1))).toBe(`purchase_limit:${limited}`);
  });
});

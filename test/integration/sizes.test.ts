import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCart, buyNowQuote, getCart, mergeGuestCart, setCartQty, setCartSize } from '@/lib/data/cart';
import { DataError } from '@/lib/data/errors';
import { cancelOrderItems, placeOrder, type PlaceOrderInput } from '@/lib/data/orders';
import { requestReturn } from '@/lib/data/returns';
import { admin, anon, deleteUser, deliveredDaysAgo, IN_SHIPPING, newUser, pickProduct, type TestUser } from './helpers';

let shopper: TestUser;
let tee: string;
let shoe: string;
let plain: string;

const codeOf = async (p: PromiseLike<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
};

const setSizes = async (id: string, sizes: string[] | null) => {
  const { error } = await admin().from('products').update({ sizes }).eq('id', id);
  if (error) throw error;
};

const order = (input: Partial<PlaceOrderInput> = {}) => placeOrder(shopper.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING, ...input });
const lineOf = async (id: string) => (await getCart(shopper.db, 'IN')).lines.find((l) => l.product.id === id);

beforeAll(async () => {
  // IN offsets 106–108 are this file's
  [tee, shoe, plain] = (await Promise.all([106, 107, 108].map((o) => pickProduct('IN', o)))).map((p) => p.id);
  await setSizes(tee, ['S', 'M', 'L']);
  await setSizes(shoe, ['UK 7', 'UK 8']);
  shopper = await newUser('Size Shopper');
});

afterAll(async () => {
  await setSizes(tee, null);
  await setSizes(shoe, null);
  await deleteUser(shopper);
});

describe('sizes', () => {
  it('show on the product', async () => {
    const { data } = await anon().from('catalog_products').select('id, sizes').in('id', [tee, plain]);
    expect(Object.fromEntries((data ?? []).map((r) => [r.id, r.sizes]))).toEqual({ [tee]: ['S', 'M', 'L'], [plain]: null });
  });

  it('pick one of the product’s sizes for its cart line, one size at a time', async () => {
    expect(await codeOf(addToCart(shopper.db, 'IN', tee, 1))).toBe(`size_required:${tee}`);
    expect(await codeOf(addToCart(shopper.db, 'IN', tee, 1, null, 'XL'))).toBe('invalid_input:size');
    expect(await codeOf(addToCart(shopper.db, 'IN', plain, 1, null, 'M'))).toBe('invalid_input:size');

    await addToCart(shopper.db, 'IN', tee, 1, null, 'M');
    await addToCart(shopper.db, 'IN', tee, 1, null, ' M ');
    expect(await lineOf(tee)).toMatchObject({ qty: 2, size: 'M' });
    expect((await lineOf(tee))?.needsSize).toBeUndefined();
    // another size of what's in the cart is changed on the line, not added beside it
    expect(await codeOf(addToCart(shopper.db, 'IN', tee, 1, null, 'L'))).toBe('size_in_cart:M');

    expect((await setCartSize(shopper.db, 'IN', tee, 'L')).lines.find((l) => l.product.id === tee)).toMatchObject({ qty: 2, size: 'L' });
    expect(await codeOf(setCartSize(shopper.db, 'IN', tee, 'XL'))).toBe('invalid_input:size');
    expect(await codeOf(setCartSize(shopper.db, 'IN', shoe, 'UK 7'))).toBe('not_in_cart:');
    // the quantity stepper keeps the size
    await setCartQty(shopper.db, 'IN', tee, 1);
    expect(await lineOf(tee)).toMatchObject({ qty: 1, size: 'L' });

    await addToCart(shopper.db, 'IN', plain, 1);
    expect((await lineOf(plain))?.size).toBeUndefined();
  });

  it('hold up checkout for a line in a size the product no longer comes in, and go into the order', async () => {
    await setSizes(tee, ['S', 'M']);
    expect(await lineOf(tee)).toMatchObject({ size: 'L', needsSize: true });
    expect(await codeOf(order())).toBe(`size_required:${tee}`);
    await setSizes(tee, ['S', 'M', 'L']);

    const placed = await order();
    expect(placed.items.find((it) => it.productId === tee)).toMatchObject({ qty: 1, size: 'L' });
    expect(placed.items.find((it) => it.productId === plain)?.size).toBeUndefined();
  });

  it('go with Buy Now, which needs one too', async () => {
    expect((await buyNowQuote(shopper.db, 'IN', tee, 1)).lines[0]).toMatchObject({ needsSize: true });
    expect((await buyNowQuote(shopper.db, 'IN', tee, 1, false, 'S')).lines[0]).toMatchObject({ size: 'S' });
    expect((await buyNowQuote(shopper.db, 'IN', tee, 1, false, 'S')).lines[0].needsSize).toBeUndefined();

    expect(await codeOf(order({ buyNow: { productId: shoe, qty: 1 } }))).toBe(`size_required:${shoe}`);
    expect(await codeOf(order({ buyNow: { productId: shoe, qty: 1, size: 'UK 9' } }))).toBe(`size_required:${shoe}`);
    const placed = await order({ buyNow: { productId: shoe, qty: 1, size: 'UK 8' } });
    expect(placed.items).toMatchObject([{ productId: shoe, size: 'UK 8' }]);
  });

  it('come along when a guest cart merges on sign-in', async () => {
    const token = crypto.randomUUID();
    await addToCart(anon(), 'IN', shoe, 1, token, 'UK 7');
    expect(await mergeGuestCart(shopper.db, token)).toBe(1);
    expect(await lineOf(shoe)).toMatchObject({ qty: 1, size: 'UK 7' });
    await setCartQty(shopper.db, 'IN', shoe, 0);
  });

  it('stay with items cancelled from an order and with returns', async () => {
    await addToCart(shopper.db, 'IN', tee, 1, null, 'M');
    await addToCart(shopper.db, 'IN', plain, 1);
    const placed = await order();
    const cut = await cancelOrderItems(shopper.db, placed.id, [tee]);
    expect(cut.cancellations?.[0].items).toMatchObject([{ productId: tee, size: 'M' }]);

    const bought = await order({ buyNow: { productId: tee, qty: 1, size: 'S' } });
    await deliveredDaysAgo(bought.id, 1);
    const ret = await requestReturn(shopper.db, bought.id, { items: [{ productId: tee, qty: 1 }], reason: 'no_longer_needed' });
    expect(ret.items).toMatchObject([{ productId: tee, size: 'S' }]);
  });
});

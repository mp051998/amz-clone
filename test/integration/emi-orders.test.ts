import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataError } from '@/lib/data/errors';
import { placeOrder } from '@/lib/data/orders';
import { EMI_MIN_MINOR } from '@/lib/emi';
import { admin, deleteUser, IN_SHIPPING, newUser, stockOf, type TestUser } from './helpers';

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}${err.detail ? `:${err.detail}` : ''}` : String(err);
  }
  return 'no error';
};

/**
 * This file's product: the first among pickProduct()'s list (by id, 25+ in stock) at IN offsets
 * 85–99 that is under ₹2,500 alone but reaches ₹3,000 within 12 units (two such orders and one
 * more unit stay within its 25).
 */
async function pick() {
  const { data, error } = await admin().from('products').select('id, price_minor').eq('market_id', 'IN').gte('stock', 25).order('id').range(85, 99);
  if (error) throw error;
  const p = data.find((x) => x.price_minor < 250000 && Math.ceil(EMI_MIN_MINOR / x.price_minor) <= 12);
  if (!p) throw new Error('no IN product between ₹250 and ₹2,500 at offsets 85–99');
  return { ...p, qty: Math.ceil(EMI_MIN_MINOR / p.price_minor) };
}

const SHIP = {
  full_name: IN_SHIPPING.fullName,
  phone: IN_SHIPPING.phone,
  line1: IN_SHIPPING.line1,
  line2: IN_SHIPPING.line2,
  city: IN_SHIPPING.city,
  state: IN_SHIPPING.state,
  postcode: IN_SHIPPING.postcode,
};

let buyer: TestUser;
let p: Awaited<ReturnType<typeof pick>>;

beforeAll(async () => {
  [buyer, p] = await Promise.all([newUser('EMI Buyer'), pick()]);
});

afterAll(async () => {
  await deleteUser(buyer);
});

describe('EMI orders', () => {
  it('only India has EMI, from ₹3,000', async () => {
    const { data } = await admin().from('markets').select('id, emi_min_minor').order('id');
    expect(data).toEqual([
      { id: 'IN', emi_min_minor: EMI_MIN_MINOR },
      { id: 'US', emi_min_minor: null },
    ]);
  });

  it('an order under the minimum can’t be paid by EMI', async () => {
    const stock = await stockOf(p.id);
    const below = placeOrder(buyer.db, 'IN', { paymentMethod: 'emi', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 1 }, emiMonths: 3 });
    expect(await failure(below)).toBe('emi_unavailable');
    expect(await stockOf(p.id)).toBe(stock);
  });

  it('keeps the tenure chosen, 3 months when not said', async () => {
    const six = await placeOrder(buyer.db, 'IN', { paymentMethod: 'emi', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: p.qty }, emiMonths: 6 });
    expect(six.totals.totalMinor).toBeGreaterThanOrEqual(EMI_MIN_MINOR);
    expect(six).toMatchObject({ status: 'placed', paymentMethod: 'emi', paymentLabel: 'EMI · 6 months', emiMonths: 6 });
    const plain = await placeOrder(buyer.db, 'IN', { paymentMethod: 'emi', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: p.qty } });
    expect(plain).toMatchObject({ paymentLabel: 'EMI · 3 months', emiMonths: 3 });
  });

  it('the database refuses other tenures, and keeps none for other methods', async () => {
    const odd = await buyer.db.rpc('place_order', { p_market: 'IN', p_payment_method: 'emi', p_shipping: SHIP, p_buy: { product_id: p.id, qty: p.qty }, p_emi_months: 24 });
    expect(odd.error).toMatchObject({ message: 'invalid_input', details: 'emi_months' });
    const cod = await buyer.db.rpc('place_order', { p_market: 'IN', p_payment_method: 'cod', p_shipping: SHIP, p_buy: { product_id: p.id, qty: 1 }, p_emi_months: 6 });
    expect(cod.error).toBeNull();
    expect(cod.data).toMatchObject({ payment_label: 'Cash on Delivery', emi_months: null });
  });
});

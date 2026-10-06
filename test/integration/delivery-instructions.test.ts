import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAddress, listAddresses, updateAddress } from '@/lib/data/addresses';
import { DataError } from '@/lib/data/errors';
import { getOrder, placeOrder } from '@/lib/data/orders';
import { deleteUser, IN_SHIPPING, newUser, pickProduct, US_SHIPPING, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('delivery instructions', () => {
  let me: TestUser;
  beforeAll(async () => {
    me = await newUser('Gate Code');
  });
  afterAll(async () => {
    await deleteUser(me);
  });

  it('an address keeps its note until it is cleared', async () => {
    const a = await createAddress(me.db, 'US', { ...US_SHIPPING, instructions: '  Leave it with the front desk  ' });
    expect(a.instructions).toBe('Leave it with the front desk');
    const ind = await createAddress(me.db, 'IN', { ...IN_SHIPPING, instructions: 'Call on arrival' });
    expect(ind.instructions).toBe('Call on arrival');

    const cleared = await updateAddress(me.db, 'US', a.id, { ...US_SHIPPING, instructions: '' });
    expect(cleared.instructions).toBeUndefined();
    expect((await listAddresses(me.db, 'US')).find((x) => x.id === a.id)?.instructions).toBeUndefined();
  });

  it('refuses a note over 250 characters, in the app and in the database', async () => {
    expect(await code(createAddress(me.db, 'US', { ...US_SHIPPING, instructions: 'x'.repeat(251) }))).toBe('invalid_input');
    const direct = await me.db.from('addresses').insert({
      market_id: 'US', full_name: 'Gate Code', phone: '2065550123', line1: '1 Main St', city: 'Seattle', state: 'WA', postcode: '98109',
      instructions: 'x'.repeat(251),
    });
    expect(direct.error?.code).toBe('23514');
  });

  it('the order keeps the note it was placed with', async () => {
    const p = await pickProduct('US', 52);
    const saved = await createAddress(me.db, 'US', { ...US_SHIPPING, line1: '2021 7th Ave', instructions: 'Gate code 4321' });
    const order = await placeOrder(me.db, 'US', {
      paymentMethod: 'card',
      shipping: { ...US_SHIPPING, line1: saved.line1, instructions: 'Gate code 4321\nRing twice' },
      buyNow: { productId: p.id, qty: 1 },
    });
    expect(order.shipTo.instructions).toBe('Gate code 4321\nRing twice');

    // editing the saved address later leaves the order alone
    await updateAddress(me.db, 'US', saved.id, { ...US_SHIPPING, line1: saved.line1, instructions: 'Use the side door' });
    expect((await getOrder(me.db, order.id))?.shipTo.instructions).toBe('Gate code 4321\nRing twice');
  });

  it('no note, no instructions; the database caps one sent past the app', async () => {
    const p = await pickProduct('US', 52);
    const plain = await placeOrder(me.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
    expect(plain.shipTo.instructions).toBeUndefined();

    const res = await me.db.rpc('place_order', {
      p_market: 'US',
      p_payment_method: 'card',
      p_shipping: { full_name: 'Gate Code', phone: '2065550123', line1: '1 Main St', city: 'Seattle', state: 'WA', postcode: '98109', instructions: `  ${'y'.repeat(300)}` },
      p_buy: { product_id: p.id, qty: 1 },
    });
    expect(res.error).toBeNull();
    expect((res.data as { ship_instructions: string }).ship_instructions).toBe('y'.repeat(250));
  });
});

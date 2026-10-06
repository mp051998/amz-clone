import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';

vi.mock('./refunds', () => ({ refundOrder: async () => undefined }));
vi.mock('./payments', () => ({ expireCardCheckout: async () => undefined }));

import { DataError } from './errors';
import { GIFT_NOTE_MAX, placeOrder, readGiftNote } from './orders';

const SHIPPING = { fullName: 'Alex Morgan', phone: '2065550123', line1: '410 Terry Ave N', city: 'Seattle', state: 'WA', postcode: '98109' };

const row = {
  id: '114-1234567-1234567',
  market_id: 'US',
  currency: 'USD',
  status: 'placed',
  payment_method: 'giftcard',
  payment_label: 'Amazon gift card balance',
  subtotal_minor: 5000,
  ship_minor: 0,
  tax_minor: 400,
  total_minor: 5400,
  ship_name: 'Alex Morgan',
  ship_phone: '2065550123',
  ship_line1: '410 Terry Ave N',
  ship_line2: null,
  ship_landmark: null,
  ship_city: 'Seattle',
  ship_state: 'WA',
  ship_postcode: '98109',
  created_at: '2026-10-06T10:00:00Z',
  placed_at: '2026-10-06T10:00:00Z',
  gift: false,
  gift_message: null,
  items: [],
};

/** A client whose place_order returns `reply` and records the arguments it was called with. */
function fakeDb(reply: Record<string, unknown> = row) {
  const calls: Record<string, unknown>[] = [];
  const db = { rpc: async (_fn: string, args: Record<string, unknown>) => (calls.push(args), { data: reply, error: null }) };
  return { db: db as unknown as Db, calls };
}

describe('readGiftNote', () => {
  it('trims the note and treats blank as none', () => {
    expect(readGiftNote('  Happy birthday!\r\nLove, Sam  ')).toBe('Happy birthday!\nLove, Sam');
    expect(readGiftNote('   ')).toBeUndefined();
    expect(readGiftNote(null)).toBeUndefined();
  });

  it(`refuses a note over ${GIFT_NOTE_MAX} characters`, () => {
    expect(readGiftNote('x'.repeat(GIFT_NOTE_MAX))).toHaveLength(GIFT_NOTE_MAX);
    expect(() => readGiftNote('x'.repeat(GIFT_NOTE_MAX + 1))).toThrow(DataError);
  });
});

describe('placeOrder delivery instructions', () => {
  it('sends the note with the address and reads it back off the order', async () => {
    const withNote = fakeDb({ ...row, ship_instructions: 'Gate code 4321' });
    const placed = await placeOrder(withNote.db, 'US', { paymentMethod: 'giftcard', shipping: { ...SHIPPING, instructions: ' Gate code 4321 ' } });
    expect(withNote.calls[0].p_shipping).toMatchObject({ instructions: 'Gate code 4321' });
    expect(placed.shipTo.instructions).toBe('Gate code 4321');

    const plain = fakeDb();
    const order = await placeOrder(plain.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING });
    expect(plain.calls[0].p_shipping).toMatchObject({ instructions: null });
    expect(order.shipTo.instructions).toBeUndefined();
  });
});

describe('placeOrder gift and speed', () => {
  it('sends the gift arguments only for a gift', async () => {
    const plain = fakeDb();
    const order = await placeOrder(plain.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING });
    expect(plain.calls[0]).not.toHaveProperty('p_gift');
    expect(order.gift).toBeUndefined();

    const gift = fakeDb({ ...row, gift: true, gift_message: 'Enjoy!' });
    const placed = await placeOrder(gift.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, gift: { message: ' Enjoy! ' } });
    expect(gift.calls[0]).toMatchObject({ p_gift: true, p_gift_message: 'Enjoy!' });
    expect(placed.gift).toEqual({ message: 'Enjoy!' });
  });

  it('a gift with no note sends no message', async () => {
    const gift = fakeDb({ ...row, gift: true });
    const placed = await placeOrder(gift.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, gift: { message: '' } });
    expect(gift.calls[0]).toMatchObject({ p_gift: true });
    expect(gift.calls[0]).not.toHaveProperty('p_gift_message');
    expect(placed.gift).toEqual({});
  });

  it('sends the speed only for fast delivery', async () => {
    const plain = fakeDb();
    await placeOrder(plain.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, speed: 'standard' });
    expect(plain.calls[0]).not.toHaveProperty('p_speed');
    const fast = fakeDb({ ...row, ship_speed: 'fast', ship_minor: 999 });
    const placed = await placeOrder(fast.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, speed: 'fast' });
    expect(fast.calls[0]).toMatchObject({ p_speed: 'fast' });
    expect(placed.shipSpeed).toBe('fast');
  });

  it('sends Buy Now’s product only for Buy Now', async () => {
    const plain = fakeDb();
    await placeOrder(plain.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING });
    expect(plain.calls[0]).not.toHaveProperty('p_buy');
    const buy = fakeDb();
    await placeOrder(buy.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, buyNow: { productId: 'k1', qty: 2 } });
    expect(buy.calls[0]).toMatchObject({ p_buy: { product_id: 'k1', qty: 2 } });
  });

  it('a too-long note fails before the order is placed', async () => {
    const gift = fakeDb();
    await expect(placeOrder(gift.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, gift: { message: 'x'.repeat(241) } })).rejects.toMatchObject({
      code: 'invalid_input',
      message: 'Gift messages can be up to 240 characters.',
    });
    expect(gift.calls).toHaveLength(0);
  });
});

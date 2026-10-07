import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';

vi.mock('./refunds', () => ({ refundOrder: async () => undefined }));
vi.mock('./payments', () => ({ expireCardCheckout: async () => undefined }));

import { DataError } from './errors';
import { archiveOrder, GIFT_NOTE_MAX, placeOrder, readGiftNote, setOrderAddress, setOrderInstructions } from './orders';

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

describe('archiveOrder', () => {
  it('archives or brings back the order, and reads when it was archived', async () => {
    const archived = fakeDb({ ...row, archived_at: '2026-10-06T12:00:00Z' });
    const order = await archiveOrder(archived.db, row.id, true);
    expect(archived.calls[0]).toEqual({ p_order_id: row.id, p_archived: true });
    expect(order.archivedAt).toBe('2026-10-06T12:00:00Z');

    const back = fakeDb({ ...row, archived_at: null });
    expect((await archiveOrder(back.db, row.id, false)).archivedAt).toBeUndefined();
    expect(back.calls[0]).toEqual({ p_order_id: row.id, p_archived: false });
  });
});

describe('setOrderInstructions', () => {
  it('sends the cleaned note and reads the order back', async () => {
    const saved = fakeDb({ ...row, ship_instructions: 'Ring twice\nBack door' });
    const order = await setOrderInstructions(saved.db, row.id, '  Ring twice\r\nBack door  ');
    expect(saved.calls[0]).toEqual({ p_order_id: row.id, p_instructions: 'Ring twice\nBack door' });
    expect(order.shipTo.instructions).toBe('Ring twice\nBack door');
  });

  it('blank (or nothing) removes them', async () => {
    const cleared = fakeDb({ ...row, ship_instructions: null });
    expect((await setOrderInstructions(cleared.db, row.id, '   ')).shipTo.instructions).toBeUndefined();
    expect(cleared.calls[0]).toEqual({ p_order_id: row.id, p_instructions: '' });
    await setOrderInstructions(cleared.db, row.id, null);
    expect(cleared.calls[1]).toEqual({ p_order_id: row.id, p_instructions: '' });
  });

  it('refuses a note over the limit before asking the database', async () => {
    const db = fakeDb();
    await expect(setOrderInstructions(db.db, row.id, 'x'.repeat(251))).rejects.toMatchObject({ code: 'invalid_input', detail: 'instructions' });
    expect(db.calls).toHaveLength(0);
  });
});

describe('setOrderAddress', () => {
  const addressId = '00000000-0000-4000-8000-00000000000a';

  it('sends the saved address id and reads the moved order back', async () => {
    const moved = fakeDb({ ...row, ship_name: 'Sam Lee', ship_line1: '1 Pine St', ship_instructions: 'Front desk' });
    const order = await setOrderAddress(moved.db, row.id, addressId);
    expect(moved.calls[0]).toEqual({ p_order_id: row.id, p_address_id: addressId });
    expect(order.shipTo).toMatchObject({ name: 'Sam Lee', line1: '1 Pine St', instructions: 'Front desk' });
  });

  it('a missing or malformed id is not found, without asking the database', async () => {
    const db = fakeDb();
    for (const bad of [undefined, null, '', 'home', 42, `${addressId}x`]) {
      await expect(setOrderAddress(db.db, row.id, bad)).rejects.toMatchObject({ code: 'address_not_found' });
    }
    expect(db.calls).toHaveLength(0);
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

import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';

const refunds = vi.hoisted(() => ({ refundOrder: vi.fn(async () => undefined), refundCancellation: vi.fn(async () => undefined) }));
vi.mock('./refunds', () => refunds);
vi.mock('./payments', () => ({ expireCardCheckout: async () => undefined }));

import { DataError } from './errors';
import { archiveOrder, cancelOrderItems, GIFT_NOTE_MAX, placeOrder, readGiftNote, setOrderAddress, setOrderGst, setOrderInstructions } from './orders';

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

  it('sends the speed only for fast delivery or the Delivery Day', async () => {
    const plain = fakeDb();
    await placeOrder(plain.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, speed: 'standard' });
    expect(plain.calls[0]).not.toHaveProperty('p_speed');
    const fast = fakeDb({ ...row, ship_speed: 'fast', ship_minor: 999 });
    const placed = await placeOrder(fast.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, speed: 'fast' });
    expect(fast.calls[0]).toMatchObject({ p_speed: 'fast' });
    expect(placed.shipSpeed).toBe('fast');
    const day = fakeDb({ ...row, ship_speed: 'day', delivery_day: 5 });
    const onDay = await placeOrder(day.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, speed: 'day' });
    expect(day.calls[0]).toMatchObject({ p_speed: 'day' });
    expect(onDay).toMatchObject({ shipSpeed: 'day', deliveryDay: 5 });
  });

  it('sends Buy Now’s product only for Buy Now', async () => {
    const plain = fakeDb();
    await placeOrder(plain.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING });
    expect(plain.calls[0]).not.toHaveProperty('p_buy');
    const buy = fakeDb();
    await placeOrder(buy.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, buyNow: { productId: 'k1', qty: 2 } });
    expect(buy.calls[0]).toMatchObject({ p_buy: { product_id: 'k1', qty: 2 } });
  });

  it('sends a promotion code, tidied, only when there is one, and reads its part of each discount back', async () => {
    const plain = fakeDb();
    await placeOrder(plain.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, promoCode: '   ' });
    expect(plain.calls[0]).not.toHaveProperty('p_promo_code');
    const promo = fakeDb({
      ...row,
      promo_code: 'SAVE10',
      discount_minor: 700,
      items: [
        { line_no: 1, product_id: 'a', title: 'Kettle', image: '', seller: 'Store', unit_price_minor: 1500, qty: 2, unit_discount_minor: 285, unit_promo_minor: 135 },
        { line_no: 2, product_id: 'b', title: 'Mug', image: '', seller: 'Store', unit_price_minor: 1300, qty: 1, unit_discount_minor: 130, unit_promo_minor: 130 },
        { line_no: 3, product_id: 'c', title: 'Book', image: '', seller: 'Store', unit_price_minor: 900, qty: 1, unit_discount_minor: 0, unit_promo_minor: 0 },
      ],
    });
    const placed = await placeOrder(promo.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, promoCode: ' save10 ' });
    expect(promo.calls[0]).toMatchObject({ p_promo_code: 'SAVE10' });
    expect(placed.promoCode).toBe('SAVE10');
    expect(placed.totals).toMatchObject({ discountMinor: 700, promoMinor: 400 });
    expect(placed.items.map((it) => it.unitPromoMinor)).toEqual([135, 130, undefined]);
  });

  it('sends the EMI tenure only for EMI, and checks it first', async () => {
    const card = fakeDb();
    await placeOrder(card.db, 'US', { paymentMethod: 'upi', shipping: SHIPPING, emiMonths: 6 });
    expect(card.calls[0]).not.toHaveProperty('p_emi_months');
    const emi = fakeDb({ ...row, payment_method: 'emi', payment_label: 'EMI · 6 months', emi_months: 6 });
    const placed = await placeOrder(emi.db, 'US', { paymentMethod: 'emi', shipping: SHIPPING, emiMonths: 6 });
    expect(emi.calls[0]).toMatchObject({ p_payment_method: 'emi', p_emi_months: 6 });
    expect(placed).toMatchObject({ paymentLabel: 'EMI · 6 months', emiMonths: 6 });
    const bad = fakeDb();
    await expect(placeOrder(bad.db, 'US', { paymentMethod: 'emi', shipping: SHIPPING, emiMonths: 24 })).rejects.toMatchObject({ code: 'invalid_input', detail: 'emiMonths' });
    expect(bad.calls).toHaveLength(0);
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

describe('cancelOrderItems', () => {
  const kettle = { line_no: 2, product_id: 'k2', title: 'Kettle', image: '', seller: 'Kettle Co', unit_price_minor: 1000, unit_discount_minor: 100, qty: 1 };
  const cancellation = (status: string) => ({
    id: 'c1',
    order_id: row.id,
    items_minor: 900,
    tax_minor: 72,
    refund_minor: 972,
    refund_status: status,
    stripe_refund_id: null,
    refunded_at: status === 'succeeded' ? '2026-10-06T11:00:00Z' : null,
    created_at: '2026-10-06T11:00:00Z',
    items: [kettle],
  });

  it('sends each line once and reads the cancelled items back', async () => {
    const { db, calls } = fakeDb({ ...row, cancellations: [cancellation('succeeded')] });
    const order = await cancelOrderItems(db, row.id, ['k2', 'k2']);
    expect(calls[0]).toEqual({ p_order_id: row.id, p_product_ids: ['k2'] });
    expect(order.cancellations).toEqual([
      {
        id: 'c1',
        items: [{ productId: 'k2', title: 'Kettle', image: '', seller: 'Kettle Co', unitPriceMinor: 1000, unitDiscountMinor: 100, qty: 1 }],
        itemsMinor: 900,
        taxMinor: 72,
        refund: { status: 'succeeded', amountMinor: 972, refundedAt: '2026-10-06T11:00:00Z' },
        createdAt: '2026-10-06T11:00:00Z',
      },
    ]);
    expect(refunds.refundCancellation).not.toHaveBeenCalled();
  });

  it('asks Stripe for a card order’s refund of the items just cancelled', async () => {
    const reply = { ...row, payment_method: 'card', cancellations: [cancellation('pending')] };
    const calls: unknown[] = [];
    const db = {
      rpc: async (_fn: string, args: unknown) => (calls.push(args), { data: reply, error: null }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: reply, error: null }) }) }) }),
    } as unknown as Db;
    await cancelOrderItems(db, row.id, ['k2']);
    expect(refunds.refundCancellation).toHaveBeenCalledWith('c1');
  });

  it('refuses no items, or anything but product ids, without asking the database', async () => {
    for (const bad of [undefined, [], 'k2', [''], [3]]) {
      const { db, calls } = fakeDb();
      await expect(cancelOrderItems(db, row.id, bad)).rejects.toMatchObject({ code: 'invalid_input', detail: 'items' });
      expect(calls).toHaveLength(0);
    }
  });
});

describe('GST invoice', () => {
  const IN_SHIPPING = { fullName: 'Asha Rao', phone: '9876543210', line1: '12 MG Road', line2: 'Ashok Nagar', city: 'Bengaluru', state: 'Karnataka', postcode: '560001' };
  const inRow = { ...row, id: '402-1234567-1234567', market_id: 'IN', currency: 'INR', payment_method: 'amazonpay', payment_label: 'Wallet balance' };
  const GST = { gstin: '27AAPFU0939F1ZV', name: 'Acme Traders' };

  /** place_order answers with the order; set_order_gst with it as `gst` says, or fails. */
  function gstDb(gst: { data?: unknown; error?: unknown } = {}) {
    const calls: [string, Record<string, unknown>][] = [];
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        if (fn !== 'set_order_gst') return { data: inRow, error: null };
        return gst.error ? { data: null, error: gst.error } : { data: gst.data ?? { ...inRow, gstin: args.p_gstin, gst_name: args.p_name }, error: null };
      },
    };
    return { db: db as unknown as Db, calls };
  }

  it('adds the tidied details once the order is placed, and reads them back', async () => {
    const t = gstDb();
    const placed = await placeOrder(t.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING, gst: { gstin: ' 27aapfu0939f1zv ', name: ' Acme  Traders ' } });
    expect(t.calls.map(([fn]) => fn)).toEqual(['place_order', 'set_order_gst']);
    expect(t.calls[1][1]).toEqual({ p_order_id: inRow.id, p_gstin: GST.gstin, p_name: GST.name });
    expect(placed.gst).toEqual(GST);
  });

  it('a blank GSTIN is none', async () => {
    const t = gstDb();
    const placed = await placeOrder(t.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING, gst: { gstin: '  ', name: '' } });
    expect(t.calls.map(([fn]) => fn)).toEqual(['place_order']);
    expect(placed.gst).toBeUndefined();
  });

  it('wrong details, or another store, fail before anything is reserved', async () => {
    const t = gstDb();
    await expect(placeOrder(t.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING, gst: { gstin: '27AAPFU0939F1ZW', name: 'Acme' } })).rejects.toMatchObject({
      code: 'invalid_input',
      detail: 'gstin',
    });
    await expect(placeOrder(t.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING, gst: { gstin: GST.gstin, name: '' } })).rejects.toMatchObject({
      code: 'invalid_input',
      detail: 'gstName',
    });
    await expect(placeOrder(t.db, 'US', { paymentMethod: 'giftcard', shipping: SHIPPING, gst: GST })).rejects.toMatchObject({ code: 'gst_unavailable' });
    expect(t.calls).toHaveLength(0);
  });

  it('keeps the placed order when the details can’t be added', async () => {
    const t = gstDb({ error: { code: 'PGRST202', message: 'Could not find the function', details: '', hint: '' } });
    const placed = await placeOrder(t.db, 'IN', { paymentMethod: 'amazonpay', shipping: IN_SHIPPING, gst: GST });
    expect(placed).toMatchObject({ id: inRow.id, status: 'placed' });
    expect(placed.gst).toBeUndefined();
  });

  it('changes or removes them later', async () => {
    const t = gstDb();
    expect((await setOrderGst(t.db, inRow.id, '29AAGCB7383J1Z4', 'Beta Labs')).gst).toEqual({ gstin: '29AAGCB7383J1Z4', name: 'Beta Labs' });
    const removed = gstDb({ data: inRow });
    expect((await setOrderGst(removed.db, inRow.id, '', '')).gst).toBeUndefined();
    expect(removed.calls[0]).toEqual(['set_order_gst', { p_order_id: inRow.id, p_gstin: '', p_name: '' }]);
    await expect(setOrderGst(t.db, inRow.id, 'nope', 'x')).rejects.toMatchObject({ code: 'invalid_input', detail: 'gstin' });
  });
});

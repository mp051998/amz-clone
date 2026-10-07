import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { addToCart, buyNowQuote, selectCartLines, setCartProtection, setCartSize } from './cart';
import { toCart } from './map';

const json = (extra: object = {}, lineExtra: object = {}) => ({
  market: 'US', currency: 'USD', free_ship_threshold_minor: 3500, count: 3,
  lines: [{ product: { id: 'a', price_minor: 2000 }, qty: 3, line_total_minor: 6000, in_stock: true, available: true, ...lineExtra }],
  totals: { subtotal_minor: 6000, ship_minor: 0, tax_minor: 0, total_minor: 6000 },
  ...extra,
});

it('maps each line’s tick and what the subtotal covers', () => {
  const cart = toCart(json({ selected_count: 0 }, { selected: false }));
  expect(cart.lines[0].selected).toBe(false);
  expect([cart.count, cart.selectedCount]).toEqual([3, 0]);
});

it('before lines could be unticked, every line counted', () => {
  const cart = toCart(json());
  expect(cart.lines[0].selected).toBe(true);
  expect(cart.selectedCount).toBe(3);
});

it('ticks one line, or every line with no product', async () => {
  const calls: [string, object][] = [];
  const db = { rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data: json(), error: null }) } as unknown as Db;
  await selectCartLines(db, 'US', 'a', false, 'tok');
  await selectCartLines(db, 'IN', null, true);
  expect(calls).toEqual([
    ['cart_select', { p_market: 'US', p_selected: false, p_product_id: 'a', p_guest_token: 'tok' }],
    ['cart_select', { p_market: 'IN', p_selected: true, p_product_id: undefined, p_guest_token: undefined }],
  ]);
});

it('maps a line’s protection plan, and the plans in the totals', () => {
  const cart = toCart(json({ totals: { subtotal_minor: 6000, ship_minor: 0, tax_minor: 0, protection_minor: 597, total_minor: 6597 } }, { protection_unit_minor: 199, protection: true }));
  expect(cart.lines[0].protection).toEqual({ unitMinor: 199, added: true });
  expect(cart.totals).toMatchObject({ protectionMinor: 597, totalMinor: 6597 });
  // a product the store doesn't cover has no plan to offer
  const plain = toCart(json({}, { protection_unit_minor: null, protection: false }));
  expect(plain.lines[0].protection).toBeUndefined();
  expect(plain.totals.protectionMinor).toBeUndefined();
});

it('sets a line’s plan, and asks Buy Now for one only when wanted', async () => {
  const calls: [string, object][] = [];
  const db = { rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data: json(), error: null }) } as unknown as Db;
  await setCartProtection(db, 'US', 'a', true, 'tok');
  await buyNowQuote(db, 'US', 'a', 2);
  await buyNowQuote(db, 'US', 'a', 1, true);
  expect(calls).toEqual([
    ['cart_set_protection', { p_market: 'US', p_product_id: 'a', p_on: true, p_guest_token: 'tok' }],
    ['buy_now_quote', { p_market: 'US', p_product: 'a', p_qty: 2 }],
    ['buy_now_quote', { p_market: 'US', p_product: 'a', p_qty: 1, p_protection: true }],
  ]);
});

it('maps a line’s size and whether it still needs one, and the sizes a product comes in', () => {
  const cart = toCart(json({}, { product: { id: 'a', price_minor: 2000, sizes: ['S', 'M'] }, size: 'M', needs_size: false }));
  expect(cart.lines[0]).toMatchObject({ size: 'M', product: { sizes: ['S', 'M'] } });
  expect(cart.lines[0].needsSize).toBeUndefined();
  const unsized = toCart(json({}, { product: { id: 'a', price_minor: 2000, sizes: ['S', 'M'] }, size: null, needs_size: true }));
  expect(unsized.lines[0]).toMatchObject({ needsSize: true });
  expect(unsized.lines[0].size).toBeUndefined();
  // a product without sizes, or a line read before sizes
  const plain = toCart(json());
  expect([plain.lines[0].size, plain.lines[0].needsSize, plain.lines[0].product.sizes]).toEqual([undefined, undefined, undefined]);
});

it('adds, re-sizes and buys now in a size, sending one only when there is one', async () => {
  const calls: [string, object][] = [];
  const db = { rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data: json(), error: null }) } as unknown as Db;
  await addToCart(db, 'IN', 'a', 1, 'tok', 'UK 8');
  await addToCart(db, 'IN', 'b', 2, null);
  await setCartSize(db, 'IN', 'a', 'UK 9', 'tok');
  await buyNowQuote(db, 'IN', 'a', 1, false, 'UK 7');
  expect(calls).toEqual([
    ['cart_set_qty', { p_market: 'IN', p_product_id: 'a', p_qty: 1, p_mode: 'add', p_guest_token: 'tok', p_size: 'UK 8' }],
    ['cart_set_qty', { p_market: 'IN', p_product_id: 'b', p_qty: 2, p_mode: 'add', p_guest_token: undefined }],
    ['cart_set_size', { p_market: 'IN', p_product_id: 'a', p_size: 'UK 9', p_guest_token: 'tok' }],
    ['buy_now_quote', { p_market: 'IN', p_product: 'a', p_qty: 1, p_size: 'UK 7' }],
  ]);
});

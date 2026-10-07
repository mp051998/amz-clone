import { expect, it } from 'vitest';
import { cartPriceChanges } from './cart-price-changes';
import { toCart } from './data/map';
import type { CartLine, Product } from './types';

const product = (id: string, priceMinor: number): Product => ({
  id, market: 'US', title: `Product ${id}`, category: 'c', categoryName: 'C', image: '', priceMinor, rating: 4, reviewCount: 1,
  seller: 'S', shipsFrom: 'S', bullets: [], stock: 20, curBase: 'USD',
});
const line = (id: string, priceMinor: number, addedPriceMinor: number | undefined, over: Partial<CartLine> = {}): CartLine => ({
  product: product(id, priceMinor), qty: 1, lineTotalMinor: priceMinor, inStock: true, available: true, selected: true,
  ...(addedPriceMinor === undefined ? {} : { addedPriceMinor }), ...over,
});

it('lists the lines whose price went up or down since they were added, in cart order', () => {
  const changes = cartPriceChanges([line('up', 1499, 1299), line('same', 999, 999), line('down', 2000, 2500), line('old', 500, undefined)]);
  expect(changes.map((c) => [c.product.id, c.fromMinor, c.toMinor])).toEqual([['up', 1299, 1499], ['down', 2500, 2000]]);
});

it('not for a product that is no longer sold', () => {
  expect(cartPriceChanges([line('gone', 1499, 1299, { available: false, inStock: false })])).toEqual([]);
});

it('reads the added price from the cart (absent before the migration)', () => {
  const base = { product: { id: 'a', price_minor: 2000 }, qty: 1, line_total_minor: 2000, in_stock: true, available: true };
  const cart = (l: object) => toCart({
    market: 'US', currency: 'USD', free_ship_threshold_minor: 3500, count: 1,
    lines: [l], totals: { subtotal_minor: 2000, ship_minor: 0, tax_minor: 160, total_minor: 2160 },
  });
  expect(cart({ ...base, added_price_minor: 1800 }).lines[0].addedPriceMinor).toBe(1800);
  expect(cart({ ...base, added_price_minor: null }).lines[0]).not.toHaveProperty('addedPriceMinor');
  expect(cart(base).lines[0]).not.toHaveProperty('addedPriceMinor');
});

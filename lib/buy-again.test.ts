import { describe, expect, it } from 'vitest';
import { availabilityOf, buyAgainItems, pastPurchases } from './buy-again';
import type { Order, OrderItem, Product } from './types';

const item = (productId: string): OrderItem => ({ productId, title: `Item ${productId}`, image: `/${productId}.jpg`, seller: 'Store', unitPriceMinor: 1000, qty: 1 });
const order = (id: string, placedAt: string, ids: string[], status: Order['status'] = 'placed') =>
  ({ id, status, placedAt, createdAt: placedAt, items: ids.map(item) }) as Order;
const product = (id: string, stock = 5, archived = false) => ({ id, stock, archived }) as Product;

describe('pastPurchases', () => {
  it('lists each product once, most recently bought first', () => {
    const past = pastPurchases([
      order('o1', '2026-09-01T10:00:00Z', ['a', 'b']),
      order('o3', '2026-09-20T10:00:00Z', ['c', 'a']),
      order('o2', '2026-09-10T10:00:00Z', ['b']),
    ]);
    expect(past.map((x) => x.productId)).toEqual(['c', 'a', 'b']);
    expect(past.find((x) => x.productId === 'a')).toMatchObject({ orders: 2, lastOrderId: 'o3', lastBoughtAt: '2026-09-20T10:00:00Z', title: 'Item a' });
    expect(past.find((x) => x.productId === 'b')).toMatchObject({ orders: 2, lastOrderId: 'o2' });
  });

  it('skips cancelled and unpaid orders', () => {
    const past = pastPurchases([
      order('o1', '2026-09-01T10:00:00Z', ['a']),
      order('o2', '2026-09-02T10:00:00Z', ['b'], 'cancelled'),
      order('o3', '2026-09-03T10:00:00Z', ['c', 'a'], 'awaiting_payment'),
    ]);
    expect(past).toEqual([expect.objectContaining({ productId: 'a', orders: 1, lastOrderId: 'o1' })]);
  });
});

describe('availabilityOf', () => {
  it('reads a product as it is now', () => {
    expect(availabilityOf(product('a'))).toBe('available');
    expect(availabilityOf(product('a', 0))).toBe('sold_out');
    expect(availabilityOf(product('a', 5, true))).toBe('gone');
    expect(availabilityOf(null)).toBe('gone');
    expect(availabilityOf(undefined)).toBe('gone');
  });
});

describe('buyAgainItems', () => {
  it('puts what you can buy first, keeping each lot newest first', () => {
    const past = pastPurchases([order('o1', '2026-09-20T10:00:00Z', ['gone', 'out', 'new']), order('o0', '2026-09-01T10:00:00Z', ['old', 'out2'])]);
    const items = buyAgainItems(past, [product('out', 0), product('new'), product('old'), product('out2', 0)]);
    expect(items.map((x) => [x.productId, x.availability])).toEqual([
      ['new', 'available'],
      ['old', 'available'],
      ['out', 'sold_out'],
      ['out2', 'sold_out'],
      ['gone', 'gone'],
    ]);
    expect(items.find((x) => x.productId === 'gone')?.product).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { filterOrders, orderSummary, periodOptions, readOrderFilter, type OrderFilter } from './order-filters';
import type { Order } from './types';

const NOW = new Date('2026-10-06T12:00:00Z');

function order(id: string, placedAt: string, over: Partial<Order> = {}): Order {
  return {
    id,
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 1000, shipMinor: 0, taxMinor: 0, totalMinor: 1000 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [{ productId: 'k', title: 'Electric Kettle 1.7L', image: '', seller: 'Kettle Co', unitPriceMinor: 1000, qty: 1 }],
    createdAt: placedAt,
    placedAt,
    ...over,
  };
}

// newest first, as listOrders returns them
const ORDERS = [
  order('ORD-A', '2026-10-01T09:00:00Z', { items: [{ productId: 'h', title: 'Sony WH-1000XM5 Headphones', image: '', seller: 'Sony', unitPriceMinor: 1000, qty: 1 }] }),
  order('ORD-B', '2026-08-20T09:00:00Z'),
  order('ORD-C', '2026-05-02T09:00:00Z', { shipTo: { name: 'Ravi Kumar', phone: '1', line1: 'x', city: 'y', state: 'z', postcode: '1' } }),
  order('ORD-D', '2025-12-24T09:00:00Z', { items: [{ productId: 'm', title: 'Ceramic Mug', image: '', seller: 'Mugs Inc', unitPriceMinor: 1000, qty: 2 }] }),
  order('ORD-E', '2024-03-01T09:00:00Z', { placedAt: undefined, createdAt: '2024-03-01T09:00:00Z' }),
];

const f = (over: Partial<OrderFilter> = {}): OrderFilter => ({ q: '', period: 'months3', page: 1, ...over });

describe('readOrderFilter', () => {
  it('defaults to the past 3 months, page 1', () => {
    expect(readOrderFilter({})).toEqual({ q: '', period: 'months3', page: 1 });
  });

  it('reads a search, a known period or year, and a page', () => {
    expect(readOrderFilter({ q: '  kettle ', period: 'y2025', page: '3' })).toEqual({ q: 'kettle', period: 'y2025', page: 3 });
    expect(readOrderFilter({ period: ['last30', 'all'] })).toMatchObject({ period: 'last30' });
    expect(readOrderFilter({ period: 'all' })).toMatchObject({ period: 'all' });
    expect(readOrderFilter({ period: 'archived' })).toMatchObject({ period: 'archived' });
  });

  it('ignores what it does not know', () => {
    expect(readOrderFilter({ period: 'forever', page: '-2' })).toEqual({ q: '', period: 'months3', page: 1 });
    expect(readOrderFilter({ period: 'y20255', page: 'x' })).toEqual({ q: '', period: 'months3', page: 1 });
    expect(readOrderFilter({ q: 'x'.repeat(300) }).q).toHaveLength(100);
  });
});

describe('periodOptions', () => {
  it('offers the recent windows, every year with an order (newest first), and everything', () => {
    expect(periodOptions(ORDERS, NOW)).toEqual([
      { value: 'last30', label: 'Last 30 days' },
      { value: 'months3', label: 'Past 3 months' },
      { value: 'y2026', label: '2026' },
      { value: 'y2025', label: '2025' },
      { value: 'y2024', label: '2024' },
      { value: 'all', label: 'All' },
    ]);
  });

  it('always offers the current year', () => {
    expect(periodOptions([], NOW).map((o) => o.value)).toEqual(['last30', 'months3', 'y2026', 'all']);
  });

  it('adds Archived while an order is archived, or while it is the view', () => {
    const archived = [ORDERS[0], { ...ORDERS[4], archivedAt: '2026-10-02T00:00:00Z' }];
    // 2024's only order is archived, so 2024 isn't a period
    expect(periodOptions(archived, NOW)).toEqual([
      { value: 'last30', label: 'Last 30 days' },
      { value: 'months3', label: 'Past 3 months' },
      { value: 'y2026', label: '2026' },
      { value: 'all', label: 'All' },
      { value: 'archived', label: 'Archived' },
    ]);
    expect(periodOptions(ORDERS, NOW, 'archived').at(-1)).toEqual({ value: 'archived', label: 'Archived' });
    expect(periodOptions(ORDERS, NOW, 'all').map((o) => o.value)).not.toContain('archived');
  });
});

describe('filterOrders', () => {
  const ids = (r: ReturnType<typeof filterOrders>) => r.items.map((o) => o.id);

  it('keeps the orders placed in the period', () => {
    expect(ids(filterOrders(ORDERS, f({ period: 'last30' }), NOW))).toEqual(['ORD-A']);
    expect(ids(filterOrders(ORDERS, f(), NOW))).toEqual(['ORD-A', 'ORD-B']);
    expect(ids(filterOrders(ORDERS, f({ period: 'y2026' }), NOW))).toEqual(['ORD-A', 'ORD-B', 'ORD-C']);
    expect(ids(filterOrders(ORDERS, f({ period: 'y2024' }), NOW))).toEqual(['ORD-E']);
    expect(filterOrders(ORDERS, f({ period: 'all' }), NOW).total).toBe(5);
  });

  it('searches every order by item, seller, recipient or order number, whatever the period', () => {
    expect(ids(filterOrders(ORDERS, f({ q: 'mug' }), NOW))).toEqual(['ORD-D']);
    expect(ids(filterOrders(ORDERS, f({ q: 'SONY headphones', period: 'y2024' }), NOW))).toEqual(['ORD-A']);
    expect(ids(filterOrders(ORDERS, f({ q: 'ravi' }), NOW))).toEqual(['ORD-C']);
    expect(ids(filterOrders(ORDERS, f({ q: 'ord-e' }), NOW))).toEqual(['ORD-E']);
    expect(ids(filterOrders(ORDERS, f({ q: 'kettle co' }), NOW))).toEqual(['ORD-B', 'ORD-C', 'ORD-E']);
    expect(filterOrders(ORDERS, f({ q: 'trampoline' }), NOW).total).toBe(0);
  });

  it('archived orders leave the periods for Archived; a search still finds them', () => {
    const list = ORDERS.map((o) => (o.id === 'ORD-A' || o.id === 'ORD-D' ? { ...o, archivedAt: '2026-10-02T00:00:00Z' } : o));
    expect(ids(filterOrders(list, f(), NOW))).toEqual(['ORD-B']);
    expect(ids(filterOrders(list, f({ period: 'all' }), NOW))).toEqual(['ORD-B', 'ORD-C', 'ORD-E']);
    expect(ids(filterOrders(list, f({ period: 'archived' }), NOW))).toEqual(['ORD-A', 'ORD-D']);
    expect(ids(filterOrders(list, f({ q: 'mug' }), NOW))).toEqual(['ORD-D']);
    expect(filterOrders(ORDERS, f({ period: 'archived' }), NOW).total).toBe(0);
  });

  it('pages ten at a time, a page past the end showing the last', () => {
    const many = Array.from({ length: 23 }, (_, i) => order(`ORD-${i}`, '2026-10-01T00:00:00Z'));
    const p1 = filterOrders(many, f(), NOW);
    expect(p1).toMatchObject({ total: 23, page: 1, pageCount: 3 });
    expect(p1.items).toHaveLength(10);
    expect(ids(filterOrders(many, f({ page: 3 }), NOW))).toEqual(['ORD-20', 'ORD-21', 'ORD-22']);
    expect(filterOrders(many, f({ page: 9 }), NOW).page).toBe(3);
    expect(filterOrders([], f({ page: 2 }), NOW)).toMatchObject({ total: 0, page: 1, pageCount: 1, items: [] });
  });
});

describe('orderSummary', () => {
  it('says how many orders the view shows', () => {
    expect(orderSummary(2, f())).toBe('2 orders placed in the past 3 months');
    expect(orderSummary(1, f({ period: 'last30' }))).toBe('1 order placed in the last 30 days');
    expect(orderSummary(3, f({ period: 'y2025' }))).toBe('3 orders placed in 2025');
    expect(orderSummary(5, f({ period: 'all' }))).toBe('5 orders in all');
    expect(orderSummary(2, f({ period: 'archived' }))).toBe('2 orders archived');
    expect(orderSummary(1, f({ q: 'mug' }))).toBe('1 order matching “mug”');
  });
});

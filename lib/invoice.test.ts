import { describe, expect, it } from 'vitest';
import { buildInvoice } from './invoice';
import type { Order, OrderReturn } from './types';

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'ORD-1',
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 5000, shipMinor: 599, taxMinor: 400, totalMinor: 5999 },
    shipTo: { name: 'Asha', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [
      { productId: 'a', title: 'Kettle', image: '/products/a.jpg', seller: 'Store', unitPriceMinor: 1500, qty: 2 },
      { productId: 'b', title: 'Mug', image: '/products/b.jpg', seller: 'Mugs Inc', unitPriceMinor: 2000, qty: 1 },
    ],
    createdAt: '2026-10-01T10:00:00Z',
    placedAt: '2026-10-01T10:00:05Z',
    ...over,
  };
}

function ret(over: Partial<OrderReturn> = {}): OrderReturn {
  return {
    id: 'RET-1',
    orderId: 'ORD-1',
    status: 'received',
    reason: 'damaged',
    resolution: 'refund',
    items: [{ productId: 'a', title: 'Kettle', image: '/products/a.jpg', unitPriceMinor: 1500, qty: 2 }],
    itemsMinor: 3000,
    taxMinor: 240,
    shipMinor: 599,
    refundMinor: 3839,
    refund: { status: 'succeeded', refundedAt: '2026-10-05T09:00:00Z' },
    dropoffCode: 'X1',
    dropoffBy: '2026-10-10',
    createdAt: '2026-10-03T12:00:00Z',
    ...over,
  };
}

describe('buildInvoice', () => {
  it('lists each line with its amount and the totals as placed', () => {
    const inv = buildInvoice(order())!;
    expect(inv.kind).toBe('invoice');
    expect(inv.lines).toEqual([
      { productId: 'a', title: 'Kettle', seller: 'Store', qty: 2, unitMinor: 1500, amountMinor: 3000, discountMinor: 0, promoMinor: 0, protectionMinor: 0 },
      { productId: 'b', title: 'Mug', seller: 'Mugs Inc', qty: 1, unitMinor: 2000, amountMinor: 2000, discountMinor: 0, promoMinor: 0, protectionMinor: 0 },
    ]);
    expect(inv).toMatchObject({ subtotalMinor: 5000, discountMinor: 0, promoMinor: 0, shipMinor: 599, wrapMinor: 0, protectionMinor: 0, taxMinor: 400, totalMinor: 5999, charged: true, refunds: [], refundedMinor: 0, netMinor: 5999 });
  });

  it('carries the gift wrap', () => {
    const inv = buildInvoice(order({ totals: { subtotalMinor: 5000, shipMinor: 599, taxMinor: 400, wrapMinor: 1197, totalMinor: 7196 } }))!;
    expect(inv).toMatchObject({ wrapMinor: 1197, totalMinor: 7196, netMinor: 7196 });
  });

  it('carries each line’s protection plans and their total', () => {
    const inv = buildInvoice(order({
      totals: { subtotalMinor: 5000, shipMinor: 599, taxMinor: 400, protectionMinor: 398, totalMinor: 6397 },
      items: [
        { productId: 'a', title: 'Kettle', image: '', seller: 'Store', unitPriceMinor: 1500, qty: 2, protectionMinor: 199 },
        { productId: 'b', title: 'Mug', image: '', seller: 'Mugs Inc', unitPriceMinor: 2000, qty: 1 },
      ],
    }))!;
    expect(inv.lines.map((l) => l.protectionMinor)).toEqual([398, 0]);
    expect(inv).toMatchObject({ protectionMinor: 398, totalMinor: 6397, netMinor: 6397 });
  });

  it('shows what a coupon took off each line and the order', () => {
    const inv = buildInvoice(order({
      totals: { subtotalMinor: 5000, discountMinor: 300, shipMinor: 0, taxMinor: 376, totalMinor: 5076 },
      items: [
        { productId: 'a', title: 'Kettle', image: '', seller: 'Store', unitPriceMinor: 1500, qty: 2, unitDiscountMinor: 150 },
        { productId: 'b', title: 'Mug', image: '', seller: 'Mugs Inc', unitPriceMinor: 2000, qty: 1 },
      ],
    }))!;
    expect(inv.lines.map((l) => [l.amountMinor, l.discountMinor])).toEqual([[3000, 300], [2000, 0]]);
    expect(inv).toMatchObject({ subtotalMinor: 5000, discountMinor: 300, totalMinor: 5076, netMinor: 5076 });
  });

  it('splits a promotion code out of the coupon savings', () => {
    const inv = buildInvoice(order({
      promoCode: 'SAVE10',
      totals: { subtotalMinor: 5000, discountMinor: 770, promoMinor: 470, shipMinor: 0, taxMinor: 338, totalMinor: 4568 },
      items: [
        { productId: 'a', title: 'Kettle', image: '', seller: 'Store', unitPriceMinor: 1500, qty: 2, unitDiscountMinor: 285, unitPromoMinor: 135 },
        { productId: 'b', title: 'Mug', image: '', seller: 'Mugs Inc', unitPriceMinor: 2000, qty: 1, unitDiscountMinor: 200, unitPromoMinor: 200 },
      ],
    }))!;
    expect(inv.lines.map((l) => [l.discountMinor, l.promoMinor])).toEqual([[300, 270], [0, 200]]);
    expect(inv).toMatchObject({ discountMinor: 300, promoMinor: 470, promoCode: 'SAVE10', totalMinor: 4568 });
  });

  it('has nothing for an order still waiting for payment', () => {
    expect(buildInvoice(order({ status: 'awaiting_payment' }))).toBeNull();
  });

  it('takes received returns off the net once their refund has gone through', () => {
    const inv = buildInvoice(order(), [
      ret(),
      ret({ id: 'RET-2', items: [{ productId: 'b', title: 'Mug', image: '', unitPriceMinor: 2000, qty: 1 }], refundMinor: 2160, refund: { status: 'pending' } }),
      ret({ id: 'RET-3', status: 'requested', refund: undefined }),
      // a received replacement gives nothing back, so it isn't a refund line
      ret({ id: 'RET-4', resolution: 'replacement', itemsMinor: 0, taxMinor: 0, shipMinor: 0, refundMinor: 0 }),
    ])!;
    expect(inv.refunds).toEqual([
      { label: 'Return of 2 items', amountMinor: 3839, status: 'succeeded', at: '2026-10-05T09:00:00Z' },
      { label: 'Return of 1 item', amountMinor: 2160, status: 'pending', at: undefined },
    ]);
    expect(inv.refundedMinor).toBe(3839);
    expect(inv.netMinor).toBe(5999 - 3839);
  });

  it('a cancelled paid order is a summary with its refund', () => {
    const inv = buildInvoice(order({ status: 'cancelled', refund: { status: 'succeeded', amountMinor: 5999, refundedAt: '2026-10-02T00:00:00Z' } }))!;
    expect(inv.kind).toBe('cancelled');
    expect(inv.refunds).toEqual([{ label: 'Order cancelled', amountMinor: 5999, status: 'succeeded', at: '2026-10-02T00:00:00Z' }]);
    expect(inv.netMinor).toBe(0);
    expect(inv.charged).toBe(true);
  });

  it('a refund still processing is listed but not taken off yet', () => {
    const inv = buildInvoice(order({ status: 'cancelled', refund: { status: 'pending', amountMinor: 5999 } }))!;
    expect(inv.refunds[0]).toMatchObject({ status: 'pending', at: undefined });
    expect(inv.netMinor).toBe(5999);
  });

  it('a cancelled pay-on-delivery order was never charged', () => {
    for (const refund of [{ status: 'not_charged' as const, amountMinor: 0 }, undefined]) {
      const inv = buildInvoice(order({ status: 'cancelled', paymentMethod: 'cod', refund }))!;
      expect(inv).toMatchObject({ kind: 'cancelled', charged: false, refunds: [], netMinor: 0 });
    }
  });
});

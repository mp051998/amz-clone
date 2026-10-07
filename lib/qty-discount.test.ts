import { describe, expect, it } from 'vitest';
import { toCart, toOrder, toProduct } from './data/map';
import { qtyDiscountShortfall, qtyDiscountText } from './qty-discount';

describe('qtyDiscountText', () => {
  it('says what buying more saves', () => {
    expect(qtyDiscountText({ percentOff: 5, minQty: 2 })).toBe('Save 5% when you buy 2 or more');
    expect(qtyDiscountText({ percentOff: 10, minQty: 12 })).toBe('Save 10% when you buy 12 or more');
  });
});

describe('qtyDiscountShortfall', () => {
  it('counts the units still to add, and none once the line qualifies', () => {
    const d = { percentOff: 5, minQty: 3 };
    expect(qtyDiscountShortfall(d, 1)).toBe(2);
    expect(qtyDiscountShortfall(d, 2)).toBe(1);
    expect(qtyDiscountShortfall(d, 3)).toBe(0);
    expect(qtyDiscountShortfall(d, 10)).toBe(0);
  });
});

describe('mapping', () => {
  it('reads a product’s quantity discount, and none when unset or half set', () => {
    expect(toProduct({ id: 'a', qty_discount_pct: 5, qty_discount_min: 2 }).qtyDiscount).toEqual({ percentOff: 5, minQty: 2 });
    expect(toProduct({ id: 'a', qty_discount_pct: null, qty_discount_min: null }).qtyDiscount).toBeUndefined();
    expect(toProduct({ id: 'a', qty_discount_pct: 5 }).qtyDiscount).toBeUndefined();
    // rows read before the migration have neither
    expect(toProduct({ id: 'a' })).not.toHaveProperty('qtyDiscount');
  });

  it('reads what quantity discounts took off a cart line and the cart', () => {
    const line = { product: { id: 'a', price_minor: 2000, qty_discount_pct: 5, qty_discount_min: 2 }, qty: 2, line_total_minor: 3800, in_stock: true, available: true };
    const cart = toCart({
      market: 'US', currency: 'USD', free_ship_threshold_minor: 3500, count: 2,
      lines: [{ ...line, discount_minor: 200, qty_discount_minor: 200 }],
      totals: { subtotal_minor: 4000, discount_minor: 200, qty_discount_minor: 200, ship_minor: 0, tax_minor: 304, total_minor: 4104 },
    });
    expect(cart.lines[0]).toMatchObject({ discountMinor: 200, qtyDiscountMinor: 200, product: { qtyDiscount: { percentOff: 5, minQty: 2 } } });
    expect(cart.totals.qtyDiscountMinor).toBe(200);

    const before = toCart({
      market: 'US', currency: 'USD', free_ship_threshold_minor: 3500, count: 2,
      lines: [{ ...line, product: { id: 'a', price_minor: 2000 }, line_total_minor: 4000 }],
      totals: { subtotal_minor: 4000, ship_minor: 0, tax_minor: 320, total_minor: 4320 },
    });
    expect(before.lines[0]).not.toHaveProperty('qtyDiscountMinor');
    expect(before.totals).not.toHaveProperty('qtyDiscountMinor');
  });

  it('totals an order’s quantity discounts over the items still in it', () => {
    const row = {
      id: 'ORD-1', market_id: 'US', currency: 'USD', status: 'placed', payment_method: 'card', payment_label: 'Visa',
      subtotal_minor: 5000, discount_minor: 334, ship_minor: 0, tax_minor: 373, total_minor: 5039,
      ship_name: 'A', ship_phone: '1', ship_line1: '1 Main', ship_city: 'Austin', ship_state: 'TX', ship_postcode: '78701',
      created_at: '2026-10-01T10:00:00Z',
      items: [
        { line_no: 1, product_id: 'a', qty: 2, unit_price_minor: 1500, unit_discount_minor: 117, unit_qty_discount_minor: 67 },
        { line_no: 2, product_id: 'b', qty: 1, unit_price_minor: 2000, unit_discount_minor: 100 },
      ],
    } as unknown as Parameters<typeof toOrder>[0];
    const order = toOrder(row);
    expect(order.items.map((it) => it.unitQtyDiscountMinor)).toEqual([67, undefined]);
    expect(order.totals.qtyDiscountMinor).toBe(134);
    expect(toOrder({ ...row, items: [{ ...row.items![1] }] } as typeof row).totals).not.toHaveProperty('qtyDiscountMinor');
  });
});

/**
 * Quantity discounts, as Amazon's "Save 5% when you buy 2 or more": a percent off each unit of a
 * line holding at least so many (products.qty_discount_pct / qty_discount_min). The database
 * works out the money (private.qty_unit_discount); this says it.
 */
export interface QtyDiscount {
  percentOff: number;
  minQty: number;
}

/** A discount's range (products_qty_discount_pct_check, products_qty_discount_min_check). */
export const QTY_DISCOUNT_PCT_MAX = 50;
export const QTY_DISCOUNT_MIN_QTY = 2;
export const QTY_DISCOUNT_MAX_QTY = 99;

/** "Save 5% when you buy 2 or more" */
export function qtyDiscountText(d: QtyDiscount): string {
  return `Save ${d.percentOff}% when you buy ${d.minQty} or more`;
}

/** How many more units a line of `qty` needs for the discount (0 once it has it). */
export function qtyDiscountShortfall(d: QtyDiscount, qty: number): number {
  return Math.max(0, d.minQty - qty);
}

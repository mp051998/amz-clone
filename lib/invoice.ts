import type { Order, OrderReturn, UsedCondition } from './types';

export interface InvoiceLine {
  productId: string;
  title: string;
  seller: string;
  /** the size ordered, for a product that comes in sizes */
  size?: string;
  /** a renewed or used item's condition (absent when new) */
  condition?: UsedCondition;
  qty: number;
  unitMinor: number;
  /** at the list price */
  amountMinor: number;
  /** what a coupon took off the line (0 without one) */
  discountMinor: number;
  /** what the quantity discount took off the line (0 without one) */
  qtyDiscountMinor: number;
  /** what the promotion code took off the line (0 without one) */
  promoMinor: number;
  /** the protection plans bought with the line (0 without one) */
  protectionMinor: number;
}

export interface InvoiceRefund {
  /** "Order cancelled", "Return of 2 items" */
  label: string;
  amountMinor: number;
  status: 'pending' | 'succeeded' | 'failed';
  /** when it was issued (succeeded only) */
  at?: string;
}

export interface Invoice {
  /** an invoice for a placed order; a cancelled order gets an order summary instead */
  kind: 'invoice' | 'cancelled';
  lines: InvoiceLine[];
  subtotalMinor: number;
  /** what coupons took off the items */
  discountMinor: number;
  /** what quantity discounts took off them (0 without any) */
  qtyDiscountMinor: number;
  /** what the promotion code took off them (0 without one), and the code */
  promoMinor: number;
  promoCode?: string;
  shipMinor: number;
  /** gift wrap (0 without it) */
  wrapMinor: number;
  /** protection plans (0 without any) */
  protectionMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** false when nothing was ever taken: a cancelled pay-on-delivery order, or no payment at all */
  charged: boolean;
  refunds: InvoiceRefund[];
  /** refunds that have gone through */
  refundedMinor: number;
  /** what the shopper has paid and kept: the total less refunds issued (0 when nothing was charged) */
  netMinor: number;
}

/**
 * The printable invoice / order summary for one of the shopper's orders: its lines and totals as
 * placed, then any money given back (the order's cancellation refund, and the refund of each
 * return the store has received). An order still waiting for payment has none (null).
 */
export function buildInvoice(order: Order, returns: readonly OrderReturn[] = []): Invoice | null {
  if (order.status === 'awaiting_payment') return null;
  const lines = order.items.map((it) => ({
    productId: it.productId,
    title: it.title,
    seller: it.seller,
    ...(it.size ? { size: it.size } : {}),
    ...(it.condition ? { condition: it.condition } : {}),
    qty: it.qty,
    unitMinor: it.unitPriceMinor,
    amountMinor: it.unitPriceMinor * it.qty,
    discountMinor: ((it.unitDiscountMinor ?? 0) - (it.unitPromoMinor ?? 0) - (it.unitQtyDiscountMinor ?? 0)) * it.qty,
    qtyDiscountMinor: (it.unitQtyDiscountMinor ?? 0) * it.qty,
    promoMinor: (it.unitPromoMinor ?? 0) * it.qty,
    protectionMinor: (it.protectionMinor ?? 0) * it.qty,
  }));

  const refunds: InvoiceRefund[] = [];
  const r = order.refund;
  const charged = order.status !== 'cancelled' || (r != null && r.status !== 'not_charged');
  if (order.status === 'cancelled' && r && r.status !== 'not_charged') {
    refunds.push({ label: 'Order cancelled', amountMinor: r.amountMinor, status: r.status, at: r.status === 'succeeded' ? r.refundedAt : undefined });
  }
  for (const ret of returns) {
    // a replacement gives nothing back
    if (!ret.refund || ret.resolution === 'replacement') continue;
    const n = ret.items.reduce((sum, it) => sum + it.qty, 0);
    refunds.push({
      label: `Return of ${n} ${n === 1 ? 'item' : 'items'}`,
      amountMinor: ret.refundMinor,
      status: ret.refund.status,
      at: ret.refund.status === 'succeeded' ? ret.refund.refundedAt : undefined,
    });
  }
  const refundedMinor = refunds.filter((x) => x.status === 'succeeded').reduce((sum, x) => sum + x.amountMinor, 0);

  return {
    kind: order.status === 'cancelled' ? 'cancelled' : 'invoice',
    lines,
    subtotalMinor: order.totals.subtotalMinor,
    discountMinor: (order.totals.discountMinor ?? 0) - (order.totals.promoMinor ?? 0) - (order.totals.qtyDiscountMinor ?? 0),
    qtyDiscountMinor: order.totals.qtyDiscountMinor ?? 0,
    promoMinor: order.totals.promoMinor ?? 0,
    ...(order.promoCode ? { promoCode: order.promoCode } : {}),
    shipMinor: order.totals.shipMinor,
    wrapMinor: order.totals.wrapMinor ?? 0,
    protectionMinor: order.totals.protectionMinor ?? 0,
    taxMinor: order.totals.taxMinor,
    totalMinor: order.totals.totalMinor,
    charged,
    refunds,
    refundedMinor,
    netMinor: charged ? Math.max(0, order.totals.totalMinor - refundedMinor) : 0,
  };
}

import type { ChipTone, StoreDates } from '@/components/orders/format';
import type { AdminOrderFilter } from '@/lib/data/admin-orders';
import type { CancelReason, OrderStage, RefundStatus } from '@/lib/types';

/** Wording for the admin orders pages. */

export const FILTER_LABEL: Record<AdminOrderFilter, string> = {
  all: 'All',
  preparing: 'Preparing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refund_issues: 'Refund issues',
};

export const STAGE_CHIP: Record<OrderStage, { label: string; tone: ChipTone }> = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'warn' },
  preparing: { label: 'Preparing', tone: 'warn' },
  shipped: { label: 'Shipped', tone: 'good' },
  out_for_delivery: { label: 'Out for delivery', tone: 'good' },
  delivered: { label: 'Delivered', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const REFUND_CHIP: Partial<Record<RefundStatus, { label: string; tone: ChipTone }>> = {
  pending: { label: 'Refund pending', tone: 'warn' },
  failed: { label: 'Refund failed', tone: 'dark' },
  succeeded: { label: 'Refunded', tone: 'neutral' },
};

export const REFUND_LABEL: Record<RefundStatus, string> = {
  pending: 'Pending with Stripe',
  succeeded: 'Refunded',
  failed: 'Failed',
  not_charged: 'Nothing to refund (pay on delivery)',
};

export const CANCEL_REASON: Record<CancelReason, string> = {
  customer: 'By the customer',
  admin: 'By an admin',
  sold_out: 'Paid after an item sold out',
  intercepted: 'Stopped in transit for the customer',
};

/** "Sep 28, 9:14 PM" (US) / "28 Sept, 9:14 pm" (IN), in the store's time zone. */
export function adminTime(iso: string, store: StoreDates): string {
  return new Intl.DateTimeFormat(store.locale.default, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: store.dates.timeZone,
  }).format(new Date(iso));
}

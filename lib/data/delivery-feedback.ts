import type { Db } from '../db/client';
import type { Order } from '../types';
import { DataError, unwrap } from './errors';

/** What went well with a delivery (thumbs up), as Amazon asks. */
export const GOOD_DELIVERY = {
  on_time: 'Arrived on time',
  good_condition: 'Package was in good condition',
  followed_instructions: 'Followed my delivery instructions',
  courteous: 'Driver was courteous',
} as const;

/** What went wrong with it (thumbs down). */
export const BAD_DELIVERY = {
  late: 'Arrived late',
  damaged: 'Package was damaged',
  unsafe_spot: 'Left somewhere unsafe',
  ignored_instructions: 'Didn’t follow my delivery instructions',
  wrong_address: 'Delivered to the wrong address',
  unprofessional: 'Driver was unprofessional',
} as const;

export type DeliveryReason = keyof typeof GOOD_DELIVERY | keyof typeof BAD_DELIVERY;

/** A shopper's thumbs up or down on how one of their orders was delivered. */
export interface DeliveryFeedback {
  orderId: string;
  positive: boolean;
  /** what went well (positive) or wrong, in the order they're asked */
  reasons: DeliveryReason[];
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DELIVERY_FEEDBACK_DAYS = 30;
export const DELIVERY_COMMENT_MAX = 500;
const DAY_MS = 86_400_000;

/** The reasons that go with a thumbs up (positive) or a thumbs down, in the order they're asked. */
export const deliveryReasons = (positive: boolean): DeliveryReason[] => Object.keys(positive ? GOOD_DELIVERY : BAD_DELIVERY) as DeliveryReason[];

export function reasonLabel(reason: DeliveryReason): string {
  return (GOOD_DELIVERY as Record<string, string>)[reason] ?? (BAD_DELIVERY as Record<string, string>)[reason] ?? reason;
}

/** Until when the delivery can be rated: 30 days after it arrived. Null before it arrives. */
export function deliveryFeedbackOpenUntil(order: Pick<Order, 'status' | 'deliveredAt'>, now: Date): Date | null {
  if (order.status !== 'placed' || !order.deliveredAt) return null;
  const delivered = Date.parse(order.deliveredAt);
  if (!(delivered <= now.getTime())) return null;
  return new Date(delivered + DELIVERY_FEEDBACK_DAYS * DAY_MS);
}

export function deliveryFeedbackOpen(order: Pick<Order, 'status' | 'deliveredAt'>, now: Date): boolean {
  const until = deliveryFeedbackOpenUntil(order, now);
  return until !== null && now.getTime() <= until.getTime();
}

const thumbs = (v: unknown): boolean | null => (v === true || v === 'up' ? true : v === false || v === 'down' ? false : null);

/**
 * Check and tidy what the shopper sent: `positive` (true/false, or "up"/"down" from the form),
 * reasons that go with it (repeats drop out, asked order kept) and an optional comment.
 */
export function parseDeliveryFeedback(input: { positive: unknown; reasons?: unknown; comment?: unknown }) {
  const positive = thumbs(input.positive);
  if (positive === null) throw new DataError('invalid_input', 'positive', 'Choose thumbs up or thumbs down.');
  const raw = input.reasons ?? [];
  const allowed: string[] = deliveryReasons(positive);
  if (!Array.isArray(raw) || !raw.every((r) => typeof r === 'string' && allowed.includes(r))) {
    throw new DataError('invalid_input', 'reasons', `Choose what went ${positive ? 'well' : 'wrong'} from the list.`);
  }
  if (input.comment != null && typeof input.comment !== 'string') throw new DataError('invalid_input', 'comment');
  const comment = (input.comment ?? '').replace(/\r\n?/g, '\n').trim();
  if (comment.length > DELIVERY_COMMENT_MAX) {
    throw new DataError('invalid_input', 'comment', `Keep your comment under ${DELIVERY_COMMENT_MAX} characters.`);
  }
  const reasons = allowed.filter((r) => raw.includes(r)) as DeliveryReason[];
  return { positive, reasons, comment: comment || null };
}

type Row = { order_id: string; positive: boolean; reasons: string[]; comment: string | null; created_at: string; updated_at: string };

function toFeedback(r: Row): DeliveryFeedback {
  return {
    orderId: r.order_id,
    positive: r.positive,
    reasons: r.reasons as DeliveryReason[],
    comment: r.comment,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLS = 'order_id, positive, reasons, comment, created_at, updated_at';

/** The feedback on an order's delivery (the caller's own; an admin sees any), or null. */
export async function deliveryFeedbackFor(db: Db, orderId: string): Promise<DeliveryFeedback | null> {
  const row = unwrap(await db.from('delivery_feedback').select(COLS).eq('order_id', orderId).maybeSingle());
  return row ? toFeedback(row) : null;
}

/** Rate the delivery of one of the caller's delivered orders, or change the rating. */
export async function leaveDeliveryFeedback(db: Db, orderId: string, input: { positive: unknown; reasons?: unknown; comment?: unknown }): Promise<DeliveryFeedback> {
  const f = parseDeliveryFeedback(input);
  const row = unwrap(
    await db.rpc('leave_delivery_feedback', {
      p_order_id: orderId,
      p_positive: f.positive,
      p_reasons: f.reasons,
      ...(f.comment === null ? {} : { p_comment: f.comment }),
    }),
  ) as unknown as Row;
  return toFeedback(row);
}

/** Remove the caller's feedback on an order's delivery. */
export async function removeDeliveryFeedback(db: Db, orderId: string): Promise<void> {
  const removed = unwrap(await db.from('delivery_feedback').delete().eq('order_id', orderId).select('order_id'));
  if (!removed.length) throw new DataError('not_found', 'feedback', 'There’s no delivery feedback on this order.');
}

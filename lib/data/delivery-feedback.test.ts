import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { deliveryFeedbackOpen, deliveryFeedbackOpenUntil, deliveryReasons, leaveDeliveryFeedback, parseDeliveryFeedback, reasonLabel, removeDeliveryFeedback } from './delivery-feedback';

const DAY = 86_400_000;
const now = new Date('2026-10-07T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

it('opens once the order arrives, for 30 days', () => {
  expect(deliveryFeedbackOpenUntil({ status: 'placed', deliveredAt: ago(2) }, now)?.toISOString()).toBe(new Date(now.getTime() + 28 * DAY).toISOString());
  expect(deliveryFeedbackOpen({ status: 'placed', deliveredAt: ago(30) }, now)).toBe(true);
  expect(deliveryFeedbackOpen({ status: 'placed', deliveredAt: ago(31) }, now)).toBe(false);
  // still on the way, or cancelled
  expect(deliveryFeedbackOpenUntil({ status: 'placed', deliveredAt: ago(-1) }, now)).toBeNull();
  expect(deliveryFeedbackOpenUntil({ status: 'cancelled', deliveredAt: ago(2) }, now)).toBeNull();
});

it('takes a thumb, the reasons that go with it in the asked order, and a tidied comment', () => {
  expect(parseDeliveryFeedback({ positive: 'down', reasons: ['unsafe_spot', 'late', 'late'], comment: '  Left in\r\nthe rain  ' })).toEqual({
    positive: false,
    reasons: ['late', 'unsafe_spot'],
    comment: 'Left in\nthe rain',
  });
  expect(parseDeliveryFeedback({ positive: true })).toEqual({ positive: true, reasons: [], comment: null });
  expect(deliveryReasons(true)).toEqual(['on_time', 'good_condition', 'followed_instructions', 'courteous']);
  expect(reasonLabel('ignored_instructions')).toBe('Didn’t follow my delivery instructions');
});

it('refuses no thumb, reasons for the other thumb or unknown ones, and long comments', () => {
  const code = (input: Parameters<typeof parseDeliveryFeedback>[0]) => {
    try {
      parseDeliveryFeedback(input);
      return 'ok';
    } catch (err) {
      return `${(err as { code: string }).code}:${(err as { detail?: string }).detail ?? ''}`;
    }
  };
  expect(code({ positive: undefined })).toBe('invalid_input:positive');
  expect(code({ positive: 'maybe' })).toBe('invalid_input:positive');
  expect(code({ positive: true, reasons: ['late'] })).toBe('invalid_input:reasons');
  expect(code({ positive: false, reasons: ['nope'] })).toBe('invalid_input:reasons');
  expect(code({ positive: false, reasons: 'late' })).toBe('invalid_input:reasons');
  expect(code({ positive: false, comment: 'x'.repeat(501) })).toBe('invalid_input:comment');
});

it('sends the tidied feedback, and says when there was none to remove', async () => {
  const calls: unknown[] = [];
  const row = { order_id: 'O1', positive: true, reasons: ['on_time'], comment: null, created_at: ago(0), updated_at: ago(0) };
  const db = {
    rpc: async (fn: string, args: object) => (calls.push([fn, args]), { data: row, error: null }),
    from: () => ({ delete: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }),
  } as unknown as Db;
  expect(await leaveDeliveryFeedback(db, 'O1', { positive: 'up', reasons: ['on_time'], comment: ' ' })).toEqual({
    orderId: 'O1', positive: true, reasons: ['on_time'], comment: null, createdAt: row.created_at, updatedAt: row.updated_at,
  });
  expect(calls).toEqual([['leave_delivery_feedback', { p_order_id: 'O1', p_positive: true, p_reasons: ['on_time'] }]]);
  await expect(removeDeliveryFeedback(db, 'O1')).rejects.toMatchObject({ code: 'not_found', detail: 'feedback' });
});

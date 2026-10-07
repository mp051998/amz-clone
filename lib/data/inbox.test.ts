import { expect, it, vi } from 'vitest';
import type { Order } from '../types';
import { buildInbox, INBOX_LIMIT, isNewMessage, orderSubject, type InboxAnswer, type InboxReply, type InboxReturn } from './inbox';

vi.mock('./orders', () => ({ listOrders: async () => [] }));

const NOW = new Date('2026-10-06T12:00:00Z');

const ITEM = { productId: 'k', title: 'Electric Kettle 1.7L', image: '', seller: 'Kettle Co', unitPriceMinor: 2500, qty: 1 };

function order(id: string, placedAt: string, over: Partial<Order> = {}): Order {
  return {
    id,
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 2500, shipMinor: 0, taxMinor: 0, totalMinor: 2500 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [ITEM],
    createdAt: placedAt,
    placedAt,
    ...over,
  };
}

const schedule = (shippedAt: string, outForDeliveryAt: string, deliveredAt: string) => ({ shippedAt, outForDeliveryAt, deliveredAt });

const ret = (over: Partial<InboxReturn>): InboxReturn => ({
  id: 'r1',
  orderId: 'D',
  status: 'received',
  receivedAt: null,
  refundStatus: null,
  refundedAt: null,
  refundMinor: 0,
  rejectedAt: null,
  rejectNote: null,
  ...over,
});

it('names an order by its first item and how many more', () => {
  expect(orderSubject({ items: [ITEM] })).toBe('Electric Kettle 1.7L');
  expect(orderSubject({ items: [ITEM, ITEM, ITEM] })).toBe('Electric Kettle 1.7L and 2 more');
  expect(orderSubject({ items: [] })).toBe('Your order');
});

it('collects what has happened, newest first, linking to where each is dealt with', () => {
  const orders = [
    // out for delivery now, not delivered yet
    order('A', '2026-10-01T10:00:00Z', schedule('2026-10-02T10:00:00Z', '2026-10-06T08:00:00Z', '2026-10-06T14:00:00Z')),
    // cancelled and refunded
    order('B', '2026-10-03T08:00:00Z', {
      status: 'cancelled',
      cancelledAt: '2026-10-03T09:00:00Z',
      refund: { status: 'succeeded', amountMinor: 2500, refundedAt: '2026-10-03T09:05:00Z' },
      items: [ITEM, { ...ITEM, productId: 'm', title: 'Mug' }, { ...ITEM, productId: 'l', title: 'Lid' }],
    }),
    // delivered
    order('D', '2026-10-01T00:00:00Z', schedule('2026-10-01T12:00:00Z', '2026-10-03T20:00:00Z', '2026-10-04T09:00:00Z')),
    // delivered too long ago
    order('OLD', '2026-06-01T00:00:00Z', schedule('2026-06-01T12:00:00Z', '2026-06-03T08:00:00Z', '2026-06-03T12:00:00Z')),
    // waiting on payment: nothing to say
    order('W', '2026-10-05T00:00:00Z', { status: 'awaiting_payment', placedAt: undefined }),
  ];
  const returns = [
    ret({ id: 'r1', receivedAt: '2026-10-05T10:00:00Z', refundStatus: 'succeeded', refundedAt: '2026-10-05T11:00:00Z', refundMinor: 1200 }),
    ret({ id: 'r2', status: 'rejected', rejectedAt: '2026-10-05T12:00:00Z', rejectNote: 'Item was used' }),
    // received, refund still going through
    ret({ id: 'r3', orderId: 'NOT-LISTED', receivedAt: '2026-10-05T09:00:00Z', refundStatus: 'pending', refundMinor: 900 }),
  ];
  const replies: InboxReply[] = [
    { id: 'm1', caseId: 'c1', subject: 'Parcel never came', at: '2026-10-06T09:00:00Z' },
    { id: 'm2', caseId: 'c1', subject: 'Parcel never came', at: '2026-10-07T09:00:00Z' }, // not yet (clock skew)
  ];
  const answers: InboxAnswer[] = [{ id: 'a1', productId: 'k', question: 'Does it whistle?', author: 'Ravi', body: 'No, it clicks off.', at: '2026-10-04T08:00:00Z' }];

  const inbox = buildInbox({ orders, returns, replies, answers }, NOW);
  expect(inbox.map((m) => m.key)).toEqual([
    'support_reply:m1',
    'out_for_delivery:A',
    'return_rejected:r2',
    'return_refunded:r1',
    'return_received:r1',
    'return_received:r3',
    'delivered:D',
    'answer:a1',
    'out_for_delivery:D',
    'refunded:B',
    'cancelled:B',
    'shipped:A',
    'shipped:D',
  ]);
  const by = (key: string) => inbox.find((m) => m.key === key)!;
  expect(by('support_reply:m1')).toMatchObject({ subject: 'Parcel never came', href: '/customer-service/cases/c1' });
  expect(by('out_for_delivery:A')).toMatchObject({ subject: 'Electric Kettle 1.7L', href: '/orders/A?placed=0', orderId: 'A' });
  expect(by('refunded:B')).toMatchObject({ subject: 'Electric Kettle 1.7L and 2 more', amountMinor: 2500 });
  expect(by('return_refunded:r1')).toMatchObject({ subject: 'Electric Kettle 1.7L', amountMinor: 1200, href: '/orders/D?placed=0' });
  expect(by('return_rejected:r2')).toMatchObject({ detail: 'Item was used' });
  expect(by('return_received:r3').subject).toBe('Your return');
  expect(by('answer:a1')).toMatchObject({ subject: 'Does it whistle?', detail: 'No, it clicks off.', from: 'Ravi', href: '/product/k#questions' });
});

it('keeps the latest ones when there are too many', () => {
  const replies: InboxReply[] = Array.from({ length: INBOX_LIMIT + 5 }, (_, i) => ({
    id: `m${i}`,
    caseId: 'c1',
    subject: 'Question',
    at: new Date(NOW.getTime() - i * 60_000).toISOString(),
  }));
  const inbox = buildInbox({ orders: [], returns: [], replies, answers: [] }, NOW);
  expect(inbox).toHaveLength(INBOX_LIMIT);
  expect(inbox[0].key).toBe('support_reply:m0');
  expect(inbox.at(-1)!.key).toBe(`support_reply:m${INBOX_LIMIT - 1}`);
});

it('counts as new what came in after the shopper last looked, and everything the first time', () => {
  const seen = '2026-10-05T10:00:00Z';
  expect(isNewMessage({ at: '2026-10-05T10:00:01Z' }, seen)).toBe(true);
  expect(isNewMessage({ at: '2026-10-05T10:00:00Z' }, seen)).toBe(false);
  expect(isNewMessage({ at: '2026-10-01T00:00:00Z' }, seen)).toBe(false);
  expect(isNewMessage({ at: '2026-10-01T00:00:00Z' }, null)).toBe(true);
});

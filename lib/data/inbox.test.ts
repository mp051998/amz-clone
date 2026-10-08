import { expect, it, vi } from 'vitest';
import type { Order } from '../types';
import { buildInbox, INBOX_LIMIT, isNewMessage, orderSubject, type InboxAnswer, type InboxReply, type InboxReturn } from './inbox';

vi.mock('./orders', () => ({ listOrders: async () => [] }));
vi.mock('./reviews', () => ({ awaitingReview: async () => [] }));

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
    { id: 'm3', caseId: 'c2', subject: 'Missing lid', at: '2026-10-03T09:00:00Z', seller: 'Acme Goods' },
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
    'support_reply:m3',
    'shipped:A',
    'shipped:D',
  ]);
  const by = (key: string) => inbox.find((m) => m.key === key)!;
  expect(by('support_reply:m1')).toMatchObject({ subject: 'Parcel never came', href: '/customer-service/cases/c1' });
  expect(by('support_reply:m1').from).toBeUndefined();
  // a seller's reply, on a "Contact seller" case, says who
  expect(by('support_reply:m3')).toMatchObject({ subject: 'Missing lid', href: '/customer-service/cases/c2', from: 'Acme Goods' });
  expect(by('out_for_delivery:A')).toMatchObject({ subject: 'Electric Kettle 1.7L', href: '/orders/A?placed=0', orderId: 'A' });
  expect(by('refunded:B')).toMatchObject({ subject: 'Electric Kettle 1.7L and 2 more', amountMinor: 2500 });
  expect(by('return_refunded:r1')).toMatchObject({ subject: 'Electric Kettle 1.7L', amountMinor: 1200, href: '/orders/D?placed=0' });
  expect(by('return_rejected:r2')).toMatchObject({ detail: 'Item was used' });
  expect(by('return_received:r3').subject).toBe('Your return');
  expect(by('answer:a1')).toMatchObject({ subject: 'Does it whistle?', detail: 'No, it clicks off.', from: 'Ravi', href: '/product/k#questions' });
});

it('says when items were cancelled from an order that kept coming, and when their refund went through', () => {
  const mug = { ...ITEM, productId: 'm', title: 'Mug' };
  const lid = { ...ITEM, productId: 'l', title: 'Lid' };
  const o = order('P', '2026-10-04T08:00:00Z', {
    cancellations: [
      { id: 'c1', items: [mug, lid], itemsMinor: 5000, taxMinor: 400, refund: { status: 'succeeded', amountMinor: 5400, refundedAt: '2026-10-04T10:05:00Z' }, createdAt: '2026-10-04T10:00:00Z' },
      // a card refund still going through
      { id: 'c2', items: [mug], itemsMinor: 2500, taxMinor: 0, refund: { status: 'pending', amountMinor: 2500 }, createdAt: '2026-10-05T10:00:00Z' },
      // pay on delivery: nothing was charged
      { id: 'c3', items: [lid], itemsMinor: 2500, taxMinor: 0, refund: { status: 'not_charged', amountMinor: 2500 }, createdAt: '2026-10-05T11:00:00Z' },
    ],
  });
  const inbox = buildInbox({ orders: [o], returns: [], replies: [], answers: [] }, NOW).filter((m) => m.kind.startsWith('items_'));
  expect(inbox.map((m) => m.key)).toEqual(['items_cancelled:c3', 'items_cancelled:c2', 'items_refunded:c1', 'items_cancelled:c1']);
  expect(inbox.find((m) => m.key === 'items_refunded:c1')).toMatchObject({ subject: 'Mug and 1 more', amountMinor: 5400, href: '/orders/P?placed=0', orderId: 'P' });
  expect(inbox.find((m) => m.key === 'items_cancelled:c2')).toMatchObject({ subject: 'Mug', at: '2026-10-05T10:00:00Z' });
});

it('says when a pre-ordered item’s price dropped before release, with the difference', () => {
  const o = order('P', '2026-10-04T08:00:00Z', {
    cancellations: [
      { id: 'g1', items: [], priceGuarantee: { productId: 'g', title: 'Starfall (PS5)', priceMinor: 4500, qty: 1 }, itemsMinor: 500, taxMinor: 40, refund: { status: 'pending', amountMinor: 540 }, createdAt: '2026-10-05T10:00:00Z' },
      // pay on delivery: it just costs less when it arrives
      { id: 'g2', items: [], priceGuarantee: { productId: 'g', title: 'Starfall (PS5)', priceMinor: 4000, qty: 1 }, itemsMinor: 500, taxMinor: 0, refund: { status: 'not_charged', amountMinor: 500 }, createdAt: '2026-10-06T10:00:00Z' },
    ],
  });
  const inbox = buildInbox({ orders: [o], returns: [], replies: [], answers: [] }, NOW).filter((m) => m.kind === 'price_guarantee');
  expect(inbox.map((m) => m.key)).toEqual(['price_guarantee:g2', 'price_guarantee:g1']);
  expect(inbox[1]).toMatchObject({ kind: 'price_guarantee', subject: 'Starfall (PS5)', amountMinor: 540, at: '2026-10-05T10:00:00Z', href: '/orders/P?placed=0' });
  expect(inbox[1].unpaid).toBeUndefined();
  expect(inbox[0].unpaid).toBe(true);
});

it('follows a replacement on its way, from the request, even if the item sent back is turned down', () => {
  const o = order('D', '2026-10-01T00:00:00Z', {
    ...schedule('2026-10-01T12:00:00Z', '2026-10-03T20:00:00Z', '2026-10-04T09:00:00Z'),
    items: [ITEM, { ...ITEM, productId: 'l', title: 'Lid' }, { ...ITEM, productId: 'm', title: 'Mug' }],
  });
  const swap = { productIds: ['m'], shippedAt: '2026-10-05T08:00:00Z', deliveredAt: '2026-10-06T10:00:00Z' };
  const returns = [
    ret({ id: 's1', status: 'requested', replacement: swap }),
    // arrives tomorrow: only the shipping so far
    ret({ id: 's2', status: 'requested', replacement: { ...swap, productIds: ['l', 'm'], deliveredAt: '2026-10-07T10:00:00Z' } }),
    ret({ id: 's3', status: 'rejected', rejectedAt: '2026-10-06T11:00:00Z', rejectNote: 'Not the item we sent', replacement: swap }),
    // a refund return still on its way back says nothing yet
    ret({ id: 'r1', status: 'requested' }),
  ];
  const inbox = buildInbox({ orders: [o], returns, replies: [], answers: [] }, NOW).filter((m) => !['shipped', 'out_for_delivery', 'delivered'].includes(m.kind));
  expect(inbox.map((m) => m.key)).toEqual([
    'return_rejected:s3',
    'replacement_delivered:s1',
    'replacement_delivered:s3',
    'replacement_shipped:s1',
    'replacement_shipped:s2',
    'replacement_shipped:s3',
  ]);
  expect(inbox.find((m) => m.key === 'replacement_shipped:s2')).toMatchObject({ subject: 'Lid and 1 more', href: '/orders/D?placed=0', orderId: 'D' });
  expect(inbox.find((m) => m.key === 'replacement_delivered:s1')).toMatchObject({ subject: 'Mug' });
  expect(inbox.find((m) => m.key === 'return_rejected:s3')).toMatchObject({ subject: 'Electric Kettle 1.7L and 2 more', detail: 'Not the item we sent' });
});

it('asks for a review two days after something arrives, until it is reviewed', () => {
  const toReview = [
    { product: { id: 'k', title: 'Electric Kettle 1.7L' }, orderId: 'D', deliveredAt: '2026-10-03T09:00:00Z' },
    // arrived yesterday: not yet
    { product: { id: 'm', title: 'Mug' }, orderId: 'E', deliveredAt: '2026-10-05T12:00:00Z' },
    // too long ago
    { product: { id: 'o', title: 'Old' }, orderId: 'F', deliveredAt: '2026-06-01T09:00:00Z' },
  ];
  const inbox = buildInbox({ orders: [], returns: [], replies: [], answers: [], toReview }, NOW);
  expect(inbox).toEqual([
    { key: 'review_request:k', kind: 'review_request', at: '2026-10-05T09:00:00.000Z', subject: 'Electric Kettle 1.7L', href: '/product/k#write-review', orderId: 'D' },
  ]);
});

it('tells the shopper when something they bought is recalled', () => {
  const recalls = [
    { productId: 'k', title: 'Electric Kettle 1.7L', hazard: 'The handle can overheat.', issuedAt: '2026-10-04T08:00:00Z', orderId: 'D' },
    // recalled too long ago to be news
    { productId: 'o', title: 'Old', hazard: 'Sharp edges.', issuedAt: '2026-05-01T08:00:00Z', orderId: 'F' },
  ];
  const inbox = buildInbox({ orders: [], returns: [], replies: [], answers: [], recalls }, NOW);
  expect(inbox).toEqual([
    { key: 'recall:k', kind: 'recall', at: '2026-10-04T08:00:00Z', subject: 'Electric Kettle 1.7L', href: '/recalls#recall-k', orderId: 'D', detail: 'The handle can overheat.' },
  ]);
});

it('tells the shopper when a deal they watch goes live', () => {
  const dealsLive = [
    { dealId: 'd1', productId: 'k', title: 'Electric Kettle 1.7L', dealPriceMinor: 2999, startedAt: '2026-10-06T09:00:00Z', endedAt: null },
    { dealId: 'd2', productId: 'm', title: 'Mug', dealPriceMinor: 500, startedAt: '2026-10-05T09:00:00Z', endedAt: '2026-10-05T15:00:00Z' },
  ];
  const inbox = buildInbox({ orders: [], returns: [], replies: [], answers: [], dealsLive }, NOW);
  expect(inbox).toEqual([
    { key: 'deal_live:d1', kind: 'deal_live', at: '2026-10-06T09:00:00Z', subject: 'Electric Kettle 1.7L', href: '/product/k', amountMinor: 2999 },
    { key: 'deal_live:d2', kind: 'deal_live', at: '2026-10-05T09:00:00Z', subject: 'Mug', href: '/product/m', amountMinor: 500, over: true },
  ]);
});

it('reminds a Plus member a week before an annual or 3-month plan renews, or any plan ends', () => {
  const at = (plus: Parameters<typeof buildInbox>[0]['plus'], now = NOW) => buildInbox({ orders: [], returns: [], replies: [], answers: [], plus }, now);
  const renewsAt = '2026-10-12T18:00:00Z';
  expect(at({ plan: 'annual', renewsAt, autoRenew: true })).toEqual([
    {
      key: `plus_renewal:${renewsAt}`,
      kind: 'plus_renewal',
      at: '2026-10-05T18:00:00.000Z',
      subject: 'Plus membership',
      href: '/prime#membership',
      periodEnd: renewsAt,
      plan: 'annual',
    },
  ]);
  // not until a week before
  expect(at({ plan: 'annual', renewsAt: '2026-10-14T18:00:00Z', autoRenew: true })).toEqual([]);
  // a monthly plan renews quietly, unless it's switching to a longer one
  expect(at({ plan: 'monthly', renewsAt, autoRenew: true })).toEqual([]);
  expect(at({ plan: 'monthly', nextPlan: 'quarterly', renewsAt, autoRenew: true })).toMatchObject([{ kind: 'plus_renewal', plan: 'quarterly' }]);
  // a switch to monthly is still news
  expect(at({ plan: 'annual', nextPlan: 'monthly', renewsAt, autoRenew: true })).toMatchObject([{ kind: 'plus_renewal', plan: 'monthly' }]);
  // with renewal off, any plan's end
  const ending = at({ plan: 'monthly', renewsAt, autoRenew: false });
  expect(ending).toEqual([
    { key: `plus_ending:${renewsAt}`, kind: 'plus_ending', at: '2026-10-05T18:00:00.000Z', subject: 'Plus membership', href: '/prime#membership', periodEnd: renewsAt },
  ]);
  expect(at(null)).toEqual([]);
  expect(at({ plan: 'annual', autoRenew: true })).toEqual([]);
  // the adult a membership is shared with isn't reminded: it isn't theirs to renew
  expect(at({ plan: 'annual', renewsAt, autoRenew: false, shared: { ownerName: 'Asha' } })).toEqual([]);
});

it('tells the shopper what the store decided on their A-to-z claims', () => {
  const acme = { ...ITEM, productId: 'b', title: 'Bluetooth Speaker', seller: 'Acme' };
  const o = order('111-0000001-0000001', '2026-09-01T10:00:00Z', { items: [ITEM, acme, { ...acme, productId: 'c', title: 'Speaker Stand' }] });
  const claims = [
    { id: 'c1', orderId: o.id, seller: 'Acme', status: 'granted' as const, decidedAt: '2026-10-06T08:00:00Z', refundMinor: 5300, note: null },
    { id: 'c2', orderId: '111-0000002-0000002', seller: 'Zed', status: 'denied' as const, decidedAt: '2026-10-05T08:00:00Z', refundMinor: 0, note: 'Tracking shows it was signed for.' },
  ];
  const inbox = buildInbox({ orders: [o], returns: [], replies: [], answers: [], claims }, NOW).filter((m) => m.kind.startsWith('claim_'));
  expect(inbox).toEqual([
    {
      key: 'claim_granted:c1',
      kind: 'claim_granted',
      at: '2026-10-06T08:00:00Z',
      subject: 'Bluetooth Speaker and 1 more',
      href: '/orders/111-0000001-0000001?placed=0#claims',
      orderId: '111-0000001-0000001',
      from: 'Acme',
      amountMinor: 5300,
    },
    {
      key: 'claim_denied:c2',
      kind: 'claim_denied',
      at: '2026-10-05T08:00:00Z',
      subject: 'Items sold by Zed',
      href: '/orders/111-0000002-0000002?placed=0#claims',
      orderId: '111-0000002-0000002',
      from: 'Zed',
      detail: 'Tracking shows it was signed for.',
    },
  ]);
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

it('a return refunded to the balance says so', () => {
  const o = order('D', '2026-10-01T00:00:00Z', schedule('2026-10-01T12:00:00Z', '2026-10-03T20:00:00Z', '2026-10-04T09:00:00Z'));
  const returns = [
    ret({ id: 'r1', receivedAt: '2026-10-05T10:00:00Z', refundStatus: 'succeeded', refundedAt: '2026-10-05T10:00:00Z', refundMinor: 1200, toBalance: true }),
    ret({ id: 'r2', receivedAt: '2026-10-05T09:00:00Z', refundStatus: 'succeeded', refundedAt: '2026-10-05T09:30:00Z', refundMinor: 900 }),
  ];
  const inbox = buildInbox({ orders: [o], returns, replies: [], answers: [] }, NOW);
  expect(inbox.find((m) => m.key === 'return_refunded:r1')).toMatchObject({ amountMinor: 1200, toBalance: true });
  expect(inbox.find((m) => m.key === 'return_refunded:r2')).not.toHaveProperty('toBalance');
});

it('a missing package reported is news only once refunded, as a refund', () => {
  const o = order('D', '2026-10-01T00:00:00Z', schedule('2026-10-01T12:00:00Z', '2026-10-03T20:00:00Z', '2026-10-04T09:00:00Z'));
  const returns = [
    ret({ id: 'm1', receivedAt: '2026-10-05T10:00:00Z', refundStatus: 'succeeded', refundedAt: '2026-10-05T10:00:00Z', refundMinor: 2500, missing: true }),
    ret({ id: 'm2', receivedAt: '2026-10-05T11:00:00Z', refundStatus: 'pending', refundMinor: 2500, missing: true }),
  ];
  const inbox = buildInbox({ orders: [o], returns, replies: [], answers: [] }, NOW).filter((m) => !['shipped', 'out_for_delivery', 'delivered'].includes(m.kind));
  expect(inbox.map((m) => [m.key, m.kind])).toEqual([['return_refunded:m1', 'refunded']]);
  expect(inbox[0]).toMatchObject({ amountMinor: 2500, href: '/orders/D?placed=0' });
});

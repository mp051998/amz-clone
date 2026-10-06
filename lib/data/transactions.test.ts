import { describe, expect, it, vi } from 'vitest';
import type { Order } from '../types';
import type { GiftCardPurchase } from './gift-card-purchases';
import { buildTransactions, type ReturnRefund } from './transactions';

vi.mock('./orders', () => ({ listOrders: async () => [] }));
vi.mock('./gift-card-purchases', () => ({ listGiftCardPurchases: async () => [] }));

const NOW = new Date('2026-10-06T12:00:00Z');

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
    items: [{ productId: 'k', title: 'Electric Kettle 1.7L', image: '', seller: 'Kettle Co', unitPriceMinor: 2500, qty: 1 }],
    createdAt: placedAt,
    placedAt,
    ...over,
  };
}

const gift = (over: Partial<GiftCardPurchase> = {}): GiftCardPurchase => ({
  id: 'g1',
  market: 'US',
  amountMinor: 5000,
  currency: 'USD',
  recipientName: null,
  message: null,
  status: 'paid',
  code: 'ABCD-EFGHIJ-KLMN',
  redeemed: false,
  createdAt: '2026-10-02T08:00:00Z',
  paidAt: '2026-10-02T08:01:00Z',
  ...over,
});

const brief = (list: ReturnType<typeof buildTransactions>) => list.map((t) => `${t.key} ${t.kind} ${t.amountMinor} ${t.status}`);

describe('buildTransactions', () => {
  it('charges an order when placed, and refunds a cancelled one', () => {
    const cancelled = order('B', '2026-10-01T09:00:00Z', {
      status: 'cancelled',
      cancelledAt: '2026-10-01T10:00:00Z',
      refund: { status: 'pending', amountMinor: 2500 },
    });
    const list = buildTransactions([order('A', '2026-10-03T09:00:00Z'), cancelled], [], [], NOW);
    expect(brief(list)).toEqual(['order:A charge 2500 completed', 'cancel:B refund 2500 pending', 'order:B charge 2500 completed']);
    expect(list[1]).toMatchObject({ source: 'cancellation', at: '2026-10-01T10:00:00Z', orderId: 'B', paymentLabel: 'Visa ending 4242' });
  });

  it('charges cash on delivery once delivered, shows it due before, and never if cancelled first', () => {
    const cod = { paymentMethod: 'cod' as const, paymentLabel: 'Cash on delivery' };
    const list = buildTransactions(
      [
        order('C1', '2026-09-20T09:00:00Z', { ...cod, deliveredAt: '2026-09-23T15:00:00Z' }),
        order('C2', '2026-10-05T09:00:00Z', { ...cod, deliveredAt: '2026-10-08T15:00:00Z' }),
        order('C3', '2026-10-04T09:00:00Z', { ...cod, status: 'cancelled', cancelledAt: '2026-10-04T10:00:00Z', refund: { status: 'not_charged', amountMinor: 0 } }),
      ],
      [],
      [],
      NOW,
    );
    expect(brief(list)).toEqual(['order:C2 charge 2500 due', 'order:C1 charge 2500 completed']);
    expect(list[1].at).toBe('2026-09-23T15:00:00Z');
  });

  it('leaves out orders that were never charged', () => {
    const unpaid = order('U', '2026-10-01T09:00:00Z', { placedAt: undefined, status: 'cancelled', refund: { status: 'not_charged', amountMinor: 0 } });
    const free = order('F', '2026-10-01T09:00:00Z', { paymentMethod: 'giftcard', totals: { subtotalMinor: 0, shipMinor: 0, taxMinor: 0, totalMinor: 0 } });
    expect(buildTransactions([unpaid, free], [], [], NOW)).toEqual([]);
  });

  it('adds return refunds and paid gift cards, newest first', () => {
    const returns: ReturnRefund[] = [
      { id: 'r1', orderId: 'A', amountMinor: 1200, status: 'succeeded', at: '2026-10-05T09:00:00Z', method: 'card', paymentLabel: 'Visa ending 4242' },
      { id: 'r2', orderId: 'A', amountMinor: 0, status: 'succeeded', at: '2026-10-05T10:00:00Z', method: 'card', paymentLabel: 'Visa ending 4242' },
      { id: 'r3', orderId: 'A', amountMinor: 800, status: 'failed', at: '2026-10-04T09:00:00Z', method: 'card', paymentLabel: 'Visa ending 4242' },
    ];
    const list = buildTransactions([order('A', '2026-09-30T09:00:00Z')], returns, [gift(), gift({ id: 'g2', status: 'awaiting_payment', paidAt: null })], NOW);
    expect(brief(list)).toEqual([
      'return:r1 refund 1200 completed',
      'return:r3 refund 800 failed',
      'gift:g1 charge 5000 completed',
      'order:A charge 2500 completed',
    ]);
    expect(list[2]).toMatchObject({ source: 'gift_card', method: 'card', at: '2026-10-02T08:01:00Z' });
  });

  it('puts a refund above the charge it gives back at the same moment', () => {
    // a card payment that arrived after the stock sold out: charged and refunded, never placed
    const late = order('L', '2026-10-01T09:00:00Z', { placedAt: undefined, status: 'cancelled', refund: { status: 'succeeded', amountMinor: 2500, refundedAt: '2026-10-01T09:00:00Z' } });
    expect(brief(buildTransactions([late], [], [], NOW))).toEqual(['cancel:L refund 2500 completed', 'order:L charge 2500 completed']);
  });
});

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
  reload: false,
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

  it('charges a Pay on Delivery order paid ahead of the delivery when it was paid', () => {
    const paid = order('P', '2026-10-03T09:00:00Z', { paymentMethod: 'upi', paymentLabel: 'UPI', prepaidAt: '2026-10-04T11:00:00Z', deliveredAt: '2026-10-08T15:00:00Z' });
    const list = buildTransactions([paid], [], [], NOW);
    expect(brief(list)).toEqual(['order:P charge 2500 completed']);
    expect(list[0].at).toBe('2026-10-04T11:00:00Z');
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

  it('shows a paid balance reload as its own source', () => {
    const list = buildTransactions([], [], [gift({ id: 'r1', reload: true, code: null })], NOW);
    expect(brief(list)).toEqual(['gift:r1 charge 5000 completed']);
    expect(list[0]).toMatchObject({ source: 'reload', method: 'card' });
  });

  it('charges mobile recharges to how they were paid, with the number', () => {
    const recharge = { id: 'm1', number: '9876543210', operator: 'Jio' as const, circle: 'Mumbai', planId: 'jio-299', amountMinor: 29_900, cashbackMinor: 598, at: '2026-10-05T08:00:00Z' };
    const list = buildTransactions([order('A', '2026-10-04T09:00:00Z')], [], [], NOW, [
      { ...recharge, method: 'amazonpay' },
      { ...recharge, id: 'm2', method: 'netbanking', bank: 'HDFC Bank', at: '2026-10-03T08:00:00Z' },
      { ...recharge, id: 'm3', method: 'upi', at: '2026-10-02T08:00:00Z' },
    ]);
    expect(brief(list)).toEqual(['recharge:m1 charge 29900 completed', 'order:A charge 2500 completed', 'recharge:m2 charge 29900 completed', 'recharge:m3 charge 29900 completed']);
    expect(list.filter((t) => t.source === 'recharge').map((t) => [t.method, t.paymentLabel, t.number])).toEqual([
      ['amazonpay', '', '9876543210'],
      ['netbanking', 'Net banking · HDFC Bank', '9876543210'],
      ['upi', 'UPI', '9876543210'],
    ]);
  });

  it('charges bill payments to how they were paid, naming the biller and account', () => {
    const bill = {
      id: 'b1', billerId: 'bescom', category: 'electricity' as const, billerName: 'BESCOM (Bengaluru)', account: '1234567890',
      period: '2026-10-01', amountMinor: 315_500, at: '2026-10-05T08:00:00Z',
    };
    const list = buildTransactions([order('A', '2026-10-04T09:00:00Z')], [], [], NOW, [], [
      { ...bill, method: 'amazonpay' },
      { ...bill, id: 'b2', method: 'netbanking', bank: 'SBI', at: '2026-10-03T08:00:00Z' },
    ]);
    expect(brief(list)).toEqual(['bill:b1 charge 315500 completed', 'order:A charge 2500 completed', 'bill:b2 charge 315500 completed']);
    expect(list.filter((t) => t.source === 'bill').map((t) => [t.method, t.paymentLabel, t.biller])).toEqual([
      ['amazonpay', '', { name: 'BESCOM (Bengaluru)', account: '1234567890' }],
      ['netbanking', 'Net banking · SBI', { name: 'BESCOM (Bengaluru)', account: '1234567890' }],
    ]);
  });

  it('charges what was paid when placed, and refunds items cancelled since on their own', () => {
    const kettle = { productId: 'k2', title: 'Kettle', image: '', seller: 'Kettle Co', unitPriceMinor: 1000, qty: 1 };
    const cancellation = (id: string, status: 'succeeded' | 'pending' | 'not_charged', at: string) => ({
      id,
      items: [kettle],
      itemsMinor: 1000,
      taxMinor: 80,
      refund: { status, amountMinor: 1080, ...(status === 'succeeded' ? { refundedAt: at } : {}) },
      createdAt: at,
    });
    const card = order('P', '2026-10-01T09:00:00Z', { cancellations: [cancellation('c1', 'pending', '2026-10-01T10:00:00Z')] });
    expect(brief(buildTransactions([card], [], [], NOW))).toEqual(['cancel-items:c1 refund 1080 pending', 'order:P charge 3580 completed']);

    // then the rest is cancelled too: the order's refund is what was left
    const all = order('Q', '2026-10-01T09:00:00Z', {
      paymentMethod: 'giftcard',
      status: 'cancelled',
      cancelledAt: '2026-10-02T09:00:00Z',
      refund: { status: 'succeeded', amountMinor: 2500, refundedAt: '2026-10-02T09:00:00Z' },
      cancellations: [cancellation('c2', 'succeeded', '2026-10-01T10:00:00Z')],
    });
    expect(brief(buildTransactions([all], [], [], NOW))).toEqual([
      'cancel:Q refund 2500 completed',
      'cancel-items:c2 refund 1080 completed',
      'order:Q charge 3580 completed',
    ]);

    // cash on delivery: the cancelled items were never charged
    const cod = order('R', '2026-10-05T09:00:00Z', {
      paymentMethod: 'cod',
      paymentLabel: 'Cash on delivery',
      cancellations: [cancellation('c3', 'not_charged', '2026-10-05T10:00:00Z')],
    });
    expect(brief(buildTransactions([cod], [], [], NOW))).toEqual(['order:R charge 2500 due']);
  });

  it('refunds a pre-order price drop as its own kind of refund, and counts it in what was charged', () => {
    const drop = {
      id: 'g1',
      items: [],
      priceGuarantee: { productId: 'g', title: 'Starfall (PS5)', priceMinor: 4500, qty: 1 },
      itemsMinor: 500,
      taxMinor: 40,
      refund: { status: 'succeeded' as const, amountMinor: 540, refundedAt: '2026-10-02T10:00:00Z' },
      createdAt: '2026-10-02T10:00:00Z',
    };
    const o = order('G', '2026-10-01T09:00:00Z', { cancellations: [drop] });
    const txs = buildTransactions([o], [], [], NOW);
    expect(brief(txs)).toEqual(['price-guarantee:g1 refund 540 completed', 'order:G charge 3040 completed']);
    expect(txs[0].source).toBe('price_guarantee');
  });

  it('charges a split payment to the card and the balance, and splits its refunds the way the database did', () => {
    const kettle = { productId: 'k', title: 'Electric Kettle 1.7L', image: '', seller: 'Kettle Co', unitPriceMinor: 1000, qty: 1 };
    // $35.80 placed: $30.00 from the balance, $5.80 by card; $10.80 of items cancelled ($5.80 card, $5.00 balance), then the rest
    const split = order('S', '2026-10-01T09:00:00Z', {
      status: 'cancelled',
      cancelledAt: '2026-10-02T09:00:00Z',
      split: { balanceMinor: 3000, chargedMinor: 580 },
      refund: { status: 'succeeded', amountMinor: 2500, refundedAt: '2026-10-02T09:00:00Z', balanceMinor: 2500 },
      cancellations: [
        {
          id: 'c1',
          items: [kettle],
          itemsMinor: 1000,
          taxMinor: 80,
          refund: { status: 'pending', amountMinor: 1080, balanceMinor: 500 },
          createdAt: '2026-10-01T10:00:00Z',
        },
      ],
    });
    const list = buildTransactions([split], [], [], NOW);
    expect(brief(list)).toEqual([
      'cancel:S:balance refund 2500 completed',
      'cancel-items:c1 refund 580 pending',
      'cancel-items:c1:balance refund 500 completed',
      'order:S charge 580 completed',
      'order:S:balance charge 3000 completed',
    ]);
    expect(list.find((t) => t.key === 'order:S:balance')).toMatchObject({ method: 'giftcard', paymentLabel: '' });
    expect(list.find((t) => t.key === 'order:S')).toMatchObject({ method: 'card', paymentLabel: 'Visa ending 4242' });

    // a return of one: the card's part and the balance's
    const ret: ReturnRefund = {
      id: 'r1',
      orderId: 'S',
      amountMinor: 1080,
      status: 'pending',
      at: '2026-10-04T09:00:00Z',
      method: 'card',
      paymentLabel: 'Visa ending 4242',
      balance: { amountMinor: 500, method: 'giftcard' },
    };
    expect(brief(buildTransactions([], [ret], [], NOW))).toEqual(['return:r1 refund 580 pending', 'return:r1:balance refund 500 completed']);
  });

  it('puts a refund above the charge it gives back at the same moment', () => {
    // a card payment that arrived after the stock sold out: charged and refunded, never placed
    const late = order('L', '2026-10-01T09:00:00Z', { placedAt: undefined, status: 'cancelled', refund: { status: 'succeeded', amountMinor: 2500, refundedAt: '2026-10-01T09:00:00Z' } });
    expect(brief(buildTransactions([late], [], [], NOW))).toEqual(['cancel:L refund 2500 completed', 'order:L charge 2500 completed']);
  });
});

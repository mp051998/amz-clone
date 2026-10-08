import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, updateProduct, type ProductInput } from '@/lib/data/admin-catalog';
import { balanceHistory } from '@/lib/data/balance';
import { listInbox } from '@/lib/data/inbox';
import { getOrder, placeOrder } from '@/lib/data/orders';
import { refundPriceGuarantees, type RefundStripe } from '@/lib/data/refunds';
import { listTransactions } from '@/lib/data/transactions';
import type { PaymentMethod } from '@/lib/types';
import { admin, deleteUser, newUser, US_SHIPPING, type TestUser } from './helpers';

const DAY = 86_400_000;
const tag = crypto.randomUUID().slice(0, 6);
// five days off: the guarantee runs to the end of that day
const RELEASE = new Date(Date.now() + 5 * DAY).toISOString();
const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  title: `Guarantee${tag} game`,
  brand: 'Starfall',
  category: 'electronics',
  image: '/products/placeholder.jpg',
  priceMinor: 5000,
  listMinor: null,
  deal: false,
  couponPct: null,
  maxPerCustomer: null,
  sizes: null,
  unit: null,
  qtyDiscount: null,
  releaseAt: RELEASE,
  badge: null,
  boughtPastMonth: null,
  seller: 'Starfall Store',
  shipsFrom: 'Store',
  bullets: [],
  description: null,
  details: [],
  // under the stock the other tests pick products by
  stock: 20,
  gallery: [],
  variantGroup: null,
  variantAxis: null,
  variantLabel: null,
  ...over,
});

const fake = (): RefundStripe => ({
  refunds: {
    list: async () => ({ data: [] }),
    create: async () => ({ id: 're_guarantee', status: 'pending' }),
  },
  checkout: { sessions: { retrieve: async () => ({ payment_intent: null }) } },
});

let boss: TestUser;
let shopper: TestUser;
let game: string;
const orders: Record<'balance' | 'card' | 'unpaid', string> = { balance: '', card: '', unpaid: '' };

const buy = (method: PaymentMethod, qty: number) =>
  placeOrder(shopper.db, 'US', { paymentMethod: method, shipping: US_SHIPPING, buyNow: { productId: game, qty } });

const reprice = async (priceMinor: number) => {
  await updateProduct(boss.db, game, input({ priceMinor }));
  await refundPriceGuarantees(game, { db: admin(), stripe: fake() });
};

const guarantees = async (id: string) => (await getOrder(shopper.db, id))!.cancellations!.filter((c) => c.priceGuarantee);

beforeAll(async () => {
  boss = await newUser('Guarantee Admin');
  shopper = await newUser('Guarantee Shopper');
  const { error } = await admin().from('admins').insert({ user_id: boss.id });
  if (error) throw error;
  game = await createProduct(boss.db, 'US', input());
  orders.balance = (await buy('giftcard', 2)).id;
  // a card order paid; and one whose checkout was never paid
  orders.card = (await buy('card', 1)).id;
  orders.unpaid = (await buy('card', 1)).id;
  const svc = admin();
  await svc.from('orders').update({ status: 'placed', placed_at: new Date().toISOString(), payment_label: 'Visa ending 4242' }).eq('id', orders.card);
  await svc.rpc('record_payment_intent', { p_order_id: orders.card, p_payment_intent: 'pi_fake' });
});

afterAll(async () => {
  // their orders go with them, then the product can
  await deleteUser(shopper);
  if (game) await admin().from('products').delete().eq('id', game);
  await deleteUser(boss);
});

describe('Pre-order Price Guarantee', () => {
  it('gives a pre-order the lower price when it drops before release, the difference back to the balance', async () => {
    const before = (await getOrder(shopper.db, orders.balance))!;
    const balanceBefore = (await balanceHistory(shopper.db, 'US', 50)).length;
    await reprice(4500);

    const after = (await getOrder(shopper.db, orders.balance))!;
    expect(after.items[0]).toMatchObject({ unitPriceMinor: 5000, qty: 2, unitDiscountMinor: 500, unitGuaranteeMinor: 500 });
    expect(after.totals).toMatchObject({ discountMinor: 1000, guaranteeMinor: 1000 });
    expect(after.totals.taxMinor).toBeLessThanOrEqual(before.totals.taxMinor);

    const [g] = await guarantees(orders.balance);
    expect(g.priceGuarantee).toEqual({ productId: game, title: `Guarantee${tag} game`, priceMinor: 4500, qty: 2 });
    expect(g.items).toEqual([]);
    expect(g).toMatchObject({ itemsMinor: 1000, taxMinor: before.totals.taxMinor - after.totals.taxMinor });
    expect(g.refund).toMatchObject({ status: 'succeeded', amountMinor: before.totals.totalMinor - after.totals.totalMinor });

    const history = await balanceHistory(shopper.db, 'US', 50);
    expect(history.length).toBe(balanceBefore + 1);
    expect(history[0]).toMatchObject({ kind: 'refund', orderId: orders.balance, amountMinor: g.refund.amountMinor });
  });

  it('refunds a card order on Stripe, and leaves an order never paid alone', async () => {
    const [g] = await guarantees(orders.card);
    expect(g).toMatchObject({ itemsMinor: 500, priceGuarantee: { qty: 1, priceMinor: 4500 } });
    expect(g.refund.status).toBe('pending');
    const { data } = await admin().from('order_cancellations').select('stripe_refund_id').eq('id', g.id).single();
    expect(data!.stripe_refund_id).toBe('re_guarantee');
    expect(await guarantees(orders.unpaid)).toEqual([]);
  });

  it('shows it in messages and transactions', async () => {
    const inbox = await listInbox(shopper.db, 'US', shopper.id);
    const msg = inbox.find((m) => m.kind === 'price_guarantee' && m.orderId === orders.balance);
    expect(msg).toMatchObject({ subject: `Guarantee${tag} game`, amountMinor: (await guarantees(orders.balance))[0].refund.amountMinor });
    const txs = await listTransactions(shopper.db, 'US', shopper.id);
    expect(txs.filter((t) => t.source === 'price_guarantee').map((t) => t.orderId).sort()).toEqual([orders.balance, orders.card].sort());
  });

  it('only ever pays the difference down to the lowest price, never for a rise', async () => {
    await reprice(5000);
    await reprice(4800);
    expect(await guarantees(orders.balance)).toHaveLength(1);
    await reprice(4000);
    const both = await guarantees(orders.balance);
    expect(both.map((g) => [g.priceGuarantee!.priceMinor, g.itemsMinor])).toEqual([[4500, 1000], [4000, 1000]]);
    expect((await getOrder(shopper.db, orders.balance))!.items[0].unitGuaranteeMinor).toBe(1000);
  });

  it('ends with the release day, and doesn’t cover an order placed after release', async () => {
    const svc = admin();
    await svc.from('products').update({ release_at: new Date(Date.now() - 3 * DAY).toISOString() }).eq('id', game);
    await svc.from('products').update({ price_minor: 3000 }).eq('id', game);
    expect(await guarantees(orders.balance)).toHaveLength(2);

    // released now, and bought afterwards: an ordinary order
    await svc.from('products').update({ price_minor: 4000, release_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', game);
    const late = (await buy('giftcard', 1)).id;
    await svc.from('products').update({ price_minor: 3500 }).eq('id', game);
    expect(await guarantees(late)).toEqual([]);
  });
});

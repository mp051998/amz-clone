import { afterAll, describe, expect, it } from 'vitest';
import { closeAccount, closureCheck, closureMessage, createAccount } from '@/lib/data/account';
import { DataError } from '@/lib/data/errors';
import { startGiftCardPurchase } from '@/lib/data/gift-card-purchases';
import { cancelOrder, placeOrder } from '@/lib/data/orders';
import { cancelReturn, requestReturn } from '@/lib/data/returns';
import { admin, anon, deliveredDaysAgo, IN_SHIPPING, pickProduct, US_SHIPPING } from './helpers';

const made: string[] = [];
afterAll(async () => {
  // the closed ones are gone already; deleting them again is harmless
  await Promise.all(made.map((id) => admin().auth.admin.deleteUser(id)));
});

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? `${err.code}:${err.detail ?? ''}` : String(err);
  }
  return 'no error';
};

async function account() {
  const email = `close-${crypto.randomUUID().slice(0, 12)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { id } = await createAccount(admin(), { email, password, name: 'Leaving Shopper' });
  made.push(id);
  const db = anon();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id, email, password, db };
}

const NOTHING_OPEN = { unpaidOrders: 0, openOrders: 0, openReturns: 0, pendingRefunds: 0, giftCardCheckouts: 0 };

describe('closing an account', () => {
  it('waits until nothing is in flight, then closes it and keeps the orders on the books', async () => {
    const me = await account();
    const svc = admin();
    const fund = await svc.from('store_balances').insert({ user_id: me.id, market_id: 'US', balance_minor: 2_500 });
    if (fund.error) throw fund.error;

    const fresh = await closureCheck(me.db);
    expect(fresh).toMatchObject(NOTHING_OPEN);
    expect(fresh.balances).toEqual([{ market: 'US', currency: 'USD', balanceMinor: 2_500 }]);

    // a cash-on-delivery order on the way, an unpaid card checkout and a gift card checkout
    const p = await pickProduct('IN', 34);
    const order = await placeOrder(me.db, 'IN', { paymentMethod: 'cod', shipping: IN_SHIPPING, buyNow: { productId: p.id, qty: 1 } });
    const q = await pickProduct('US', 54);
    const unpaid = await placeOrder(me.db, 'US', { paymentMethod: 'card', shipping: US_SHIPPING, buyNow: { productId: q.id, qty: 1 } });
    const giftCard = await startGiftCardPurchase(me.db, 'US', { amountMinor: 5_000 });
    expect(await closureCheck(me.db)).toMatchObject({ ...NOTHING_OPEN, unpaidOrders: 1, openOrders: 1, giftCardCheckouts: 1 });
    expect(await failure(closeAccount(svc, me.db, me, { currentPassword: me.password }))).toBe('account_not_closable:');

    await cancelOrder(me.db, unpaid.id);
    await deliveredDaysAgo(order.id, 1);
    // Stripe's page for it has expired: an abandoned gift card checkout doesn't hold the account open
    const stale = await svc.from('gift_card_purchases').update({ created_at: new Date(Date.now() - 2 * 3_600_000).toISOString() }).eq('id', giftCard.id);
    if (stale.error) throw stale.error;

    // a return in progress holds it open too
    const ret = await requestReturn(me.db, order.id, { items: [{ productId: p.id, qty: 1 }], reason: 'no_longer_needed' });
    expect(await closureCheck(me.db)).toMatchObject({ ...NOTHING_OPEN, openReturns: 1 });
    await cancelReturn(me.db, ret.id);
    expect(closureMessage(await closureCheck(me.db))).toBeNull();

    expect(await failure(closeAccount(svc, me.db, me, { currentPassword: 'not-my-password' }))).toBe('invalid_input:currentPassword');
    await closeAccount(svc, me.db, me, { currentPassword: me.password });

    const user = await svc.auth.admin.getUserById(me.id);
    expect(user.data.user).toBeNull();
    const again = await anon().auth.signInWithPassword({ email: me.email, password: me.password });
    expect(again.error).toBeTruthy();

    // the store's records stay, without the link to the account
    const orders = await svc.from('orders').select('id, user_id, status').in('id', [order.id, unpaid.id]).order('id');
    expect(orders.data?.map((o) => o.user_id)).toEqual([null, null]);
    const returns = await svc.from('returns').select('user_id, status').eq('id', ret.id).single();
    expect(returns.data).toEqual({ user_id: null, status: 'cancelled' });
    const purchase = await svc.from('gift_card_purchases').select('user_id').eq('id', giftCard.id).single();
    expect(purchase.data?.user_id).toBeNull();
    // what was only the shopper's goes
    const [profile, balance] = await Promise.all([
      svc.from('profiles').select('id').eq('id', me.id),
      svc.from('store_balances').select('user_id').eq('user_id', me.id),
    ]);
    expect(profile.data).toEqual([]);
    expect(balance.data).toEqual([]);
  });

  it('is for signed-in shoppers only', async () => {
    // guests can't call it at all
    expect(await failure(closureCheck(anon()))).toMatch(/^forbidden:/);
  });
});

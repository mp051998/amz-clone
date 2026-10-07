import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listSavedCards, removeSavedCard, stripeCustomerOf } from '@/lib/data/wallet';
import { DataError } from '@/lib/data/errors';
import { admin, deleteUser, newUser, type TestUser } from './helpers';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('whose Stripe customer is whose (saved cards)', () => {
  let me: TestUser;
  let other: TestUser;
  const mine = `cus_T${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  beforeAll(async () => {
    [me, other] = await Promise.all([newUser('Card Saver', { funded: false }), newUser('Someone Else', { funded: false })]);
  });
  afterAll(async () => {
    await Promise.all([deleteUser(me), deleteUser(other)]);
  });

  it('only the server records it, one customer per shopper and each customer once', async () => {
    expect(await stripeCustomerOf(me.id)).toBeNull();
    expect(await listSavedCards(me.id)).toEqual([]);
    expect(await code(removeSavedCard(me.id, 'pm_123'))).toBe('card_not_found');

    expect((await admin().from('stripe_customers').insert({ user_id: me.id, customer_id: 'not-a-customer' })).error).not.toBeNull();
    expect((await admin().from('stripe_customers').insert({ user_id: me.id, customer_id: mine })).error).toBeNull();
    expect(await stripeCustomerOf(me.id)).toBe(mine);
    expect((await admin().from('stripe_customers').insert({ user_id: me.id, customer_id: `${mine}x` })).error).not.toBeNull();
    expect((await admin().from('stripe_customers').insert({ user_id: other.id, customer_id: mine })).error).not.toBeNull();
  });

  it('a shopper can’t read it, or point their account at someone else’s cards', async () => {
    const read = await me.db.from('stripe_customers').select('customer_id');
    expect(read.data ?? []).toEqual([]);
    const write = await other.db.from('stripe_customers').insert({ user_id: other.id, customer_id: 'cus_Stolen123' });
    expect(write.error).not.toBeNull();
    const move = await me.db.from('stripe_customers').update({ customer_id: 'cus_Stolen123' }).eq('user_id', me.id);
    expect(move.error).not.toBeNull();
    expect(await stripeCustomerOf(other.id)).toBeNull();
    expect(await stripeCustomerOf(me.id)).toBe(mine);
  });

  it('goes with the account', async () => {
    await deleteUser(me);
    const { data } = await admin().from('stripe_customers').select('user_id').eq('customer_id', mine);
    expect(data).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from './errors';

const state = vi.hoisted(() => ({
  rows: {} as Record<string, string>,
  stripe: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('../stripe', () => ({
  get stripe() {
    return state.stripe;
  },
}));
vi.mock('../supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: (_col: string, userId: string) => ({ maybeSingle: async () => ({ data: state.rows[userId] ? { customer_id: state.rows[userId] } : null, error: null }) }) }),
      upsert: async (row: { user_id: string; customer_id: string }) => {
        state.rows[row.user_id] ??= row.customer_id;
        return { error: null };
      },
    }),
  }),
}));

import { addedCard, cardLabel, ensureStripeCustomer, listSavedCards, removeSavedCard, savedCardsCheckout, startAddCard, toSavedCard } from './wallet';

const NOW = new Date('2026-10-08T12:00:00Z');
const pm = (id: string, card: { brand?: string; last4?: string; exp_month?: number; exp_year?: number; fingerprint?: string } | null, created = 1) => ({
  id,
  created,
  card: card ? { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030, fingerprint: `fp_${id}`, ...card } : null,
});

const fake = {
  customers: { create: vi.fn(), listPaymentMethods: vi.fn() },
  paymentMethods: { detach: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
};

beforeEach(() => {
  state.rows = {};
  state.stripe = fake;
  for (const f of [fake.customers.create, fake.customers.listPaymentMethods, fake.paymentMethods.detach, fake.checkout.sessions.create, fake.checkout.sessions.retrieve]) f.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return err instanceof DataError ? err.code : String(err);
  }
  return 'no error';
};

describe('toSavedCard', () => {
  it('names the brand and tells an expired card by the end of its month', () => {
    expect(toSavedCard(pm('pm_1', { brand: 'mastercard', last4: '4444', exp_month: 10, exp_year: 2026 }) as never, NOW)).toEqual({
      id: 'pm_1', brand: 'Mastercard', last4: '4444', expMonth: 10, expYear: 2026, expired: false,
    });
    expect(toSavedCard(pm('pm_2', { exp_month: 9, exp_year: 2026 }) as never, NOW)?.expired).toBe(true);
    expect(toSavedCard(pm('pm_3', { brand: 'rupay', exp_month: 1, exp_year: 2027 }) as never, NOW)).toMatchObject({ brand: 'RuPay', expired: false });
    expect(toSavedCard(pm('pm_4', null) as never, NOW)).toBeNull();
    expect(cardLabel({ brand: 'Visa', last4: '4242' })).toBe('Visa ending 4242');
  });
});

describe('the Stripe customer', () => {
  it('is made once, then reused', async () => {
    fake.customers.create.mockResolvedValue({ id: 'cus_new' });
    expect(await ensureStripeCustomer({ id: 'u1', email: 'asha@example.com', name: 'Asha' })).toBe('cus_new');
    expect(fake.customers.create).toHaveBeenCalledWith(
      { email: 'asha@example.com', name: 'Asha', metadata: { userId: 'u1' } },
      { idempotencyKey: 'customer-u1' },
    );
    expect(await ensureStripeCustomer({ id: 'u1', email: 'asha@example.com' })).toBe('cus_new');
    expect(fake.customers.create).toHaveBeenCalledTimes(1);
  });

  it('a card checkout offers to save the card and shows saved ones; without it, it still goes ahead', async () => {
    expect(await savedCardsCheckout(null)).toEqual({});
    state.rows.u1 = 'cus_1';
    expect(await savedCardsCheckout({ id: 'u1', email: null })).toEqual({
      customer: 'cus_1',
      saved_payment_method_options: { payment_method_save: 'enabled', allow_redisplay_filters: ['always', 'limited', 'unspecified'] },
    });
    fake.customers.create.mockRejectedValue(new Error('Stripe is down'));
    expect(await savedCardsCheckout({ id: 'u2', email: null })).toEqual({});
  });
});

describe('saved cards', () => {
  it('none until there is a customer, and none without Stripe', async () => {
    expect(await listSavedCards('u1', NOW)).toEqual([]);
    expect(fake.customers.listPaymentMethods).not.toHaveBeenCalled();
    state.rows.u1 = 'cus_1';
    state.stripe = null;
    expect(await listSavedCards('u1', NOW)).toEqual([]);
  });

  it('lists the newest first, each card once', async () => {
    state.rows.u1 = 'cus_1';
    fake.customers.listPaymentMethods.mockResolvedValue({
      data: [
        pm('pm_old', { fingerprint: 'fp_a', last4: '4242' }, 1),
        pm('pm_mc', { brand: 'mastercard', last4: '4444', fingerprint: 'fp_b' }, 2),
        pm('pm_again', { fingerprint: 'fp_a', last4: '4242' }, 3),
      ],
    });
    expect((await listSavedCards('u1', NOW)).map((c) => `${c.id} ${cardLabel(c)}`)).toEqual(['pm_again Visa ending 4242', 'pm_mc Mastercard ending 4444']);
    expect(fake.customers.listPaymentMethods).toHaveBeenCalledWith('cus_1', { type: 'card', limit: 50 });
  });

  it('says so when Stripe can’t list them', async () => {
    state.rows.u1 = 'cus_1';
    fake.customers.listPaymentMethods.mockRejectedValue(new Error('timeout'));
    expect(await failure(listSavedCards('u1', NOW))).toBe('payments_unavailable');
  });

  it('removes only the shopper’s own card, every copy of it', async () => {
    expect(await failure(removeSavedCard('u1', 'pm_x'))).toBe('card_not_found');
    state.rows.u1 = 'cus_1';
    expect(await failure(removeSavedCard('u1', 'not a card'))).toBe('card_not_found');
    fake.customers.listPaymentMethods.mockResolvedValue({
      data: [pm('pm_a1', { fingerprint: 'fp_a' }), pm('pm_b', { fingerprint: 'fp_b' }), pm('pm_a2', { fingerprint: 'fp_a' })],
    });
    // someone else's card id
    expect(await failure(removeSavedCard('u1', 'pm_theirs'))).toBe('card_not_found');
    expect(fake.paymentMethods.detach).not.toHaveBeenCalled();

    await removeSavedCard('u1', 'pm_a2');
    expect(fake.paymentMethods.detach.mock.calls.map((c) => c[0])).toEqual(['pm_a1', 'pm_a2']);
  });
});

describe('adding a card', () => {
  it('opens a setup session on Stripe for the shopper’s customer', async () => {
    state.rows.u1 = 'cus_1';
    fake.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.com/c/setup' });
    expect(await startAddCard({ id: 'u1', email: null }, { successUrl: 'https://shop.test/account/payments', cancelUrl: 'https://shop.test/account/payments?canceled=1' })).toBe(
      'https://checkout.stripe.com/c/setup',
    );
    expect(fake.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'setup',
        customer: 'cus_1',
        payment_method_types: ['card'],
        success_url: 'https://shop.test/account/payments?added={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://shop.test/account/payments?canceled=1',
      }),
    );
    state.stripe = null;
    expect(await failure(startAddCard({ id: 'u1', email: null }, { successUrl: 'x', cancelUrl: 'y' }))).toBe('payments_unavailable');
  });

  it('confirms the saved card only for the shopper’s own finished session', async () => {
    state.rows.u1 = 'cus_1';
    const session = (over: object) => ({ mode: 'setup', status: 'complete', customer: 'cus_1', setup_intent: { payment_method: pm('pm_new', { last4: '1881' }) }, ...over });
    fake.checkout.sessions.retrieve.mockResolvedValueOnce(session({}));
    expect(await addedCard('u1', 'cs_test_1')).toMatchObject({ id: 'pm_new', last4: '1881' });
    expect(fake.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_test_1', { expand: ['setup_intent.payment_method'] });

    fake.checkout.sessions.retrieve.mockResolvedValueOnce(session({ customer: 'cus_other' }));
    expect(await addedCard('u1', 'cs_test_2')).toBeNull();
    fake.checkout.sessions.retrieve.mockResolvedValueOnce(session({ status: 'open' }));
    expect(await addedCard('u1', 'cs_test_3')).toBeNull();
    expect(await addedCard('u1', '<script>')).toBeNull();
    expect(await addedCard('u2', 'cs_test_4')).toBeNull();
  });
});

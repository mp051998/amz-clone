import { expect, it } from 'vitest';
import { checkPurchase, toPurchase, wholeMoney } from './gift-card-purchases';

it('formats whole gift card amounts', () => {
  expect(wholeMoney(5000, 'USD')).toBe('$50');
  expect(wholeMoney(5050, 'USD')).toBe('$50.50');
  expect(wholeMoney(100_000, 'INR')).toBe('₹1,000');
});

it('takes whole amounts within the store’s limits', () => {
  expect(checkPurchase('US', { amountMinor: 5000, recipientName: '  Ravi ', message: '' })).toEqual({ amountMinor: 5000, quantity: 1, recipientName: 'Ravi', message: null });
  for (const amountMinor of [0, 50, 5050, 200_100, Number.NaN, '5000']) {
    expect(() => checkPurchase('US', { amountMinor })).toThrow('Choose a whole amount from $1 to $2,000.');
  }
  expect(() => checkPurchase('IN', { amountMinor: 900 })).toThrow('Choose a whole amount from ₹10 to ₹10,000.');
  expect(checkPurchase('IN', { amountMinor: 1_000_000 }).amountMinor).toBe(1_000_000);
});

it('takes 1 to 10 cards of the amount', () => {
  expect(checkPurchase('US', { amountMinor: 5000, quantity: 10 }).quantity).toBe(10);
  expect(checkPurchase('US', { amountMinor: 5000, quantity: null }).quantity).toBe(1);
  for (const quantity of [0, 11, 1.5, Number.NaN, '2']) {
    expect(() => checkPurchase('US', { amountMinor: 5000, quantity })).toThrow('Choose from 1 to 10 gift cards.');
  }
});

it('limits the name and message', () => {
  expect(() => checkPurchase('US', { amountMinor: 5000, recipientName: 'x'.repeat(61) })).toThrow(/name/);
  expect(() => checkPurchase('US', { amountMinor: 5000, message: 'x'.repeat(241) })).toThrow(/message/);
});

it('maps a purchase row', () => {
  expect(
    toPurchase({
      id: 'p1', market_id: 'IN', amount_minor: 50_000, currency: 'INR', recipient_name: null, message: 'Happy Diwali!',
      status: 'paid', code: 'A1B2-C3D4E5-F6A7', redeemed: true, created_at: 'c', paid_at: 'p',
    }),
  ).toEqual({
    id: 'p1', market: 'IN', amountMinor: 50_000, currency: 'INR', recipientName: null, message: 'Happy Diwali!',
    status: 'paid', quantity: 1, code: 'A1B2-C3D4E5-F6A7', codes: [{ code: 'A1B2-C3D4E5-F6A7', redeemed: true }], redeemed: true, reload: false,
    createdAt: 'c', paidAt: 'p',
  });
  // several cards bought together: a code each
  const codes = [{ code: 'AAAA-111111-AAAA', redeemed: true }, { code: 'BBBB-222222-BBBB', redeemed: false }];
  expect(
    toPurchase({
      id: 'p2', market_id: 'US', amount_minor: 2_500, currency: 'USD', recipient_name: null, message: null,
      status: 'paid', code: codes[0].code, redeemed: false, quantity: 2, codes, created_at: 'c', paid_at: 'p',
    }),
  ).toMatchObject({ quantity: 2, code: codes[0].code, codes, redeemed: false });
  // a balance reload: paid into the buyer's own balance, so no code
  expect(
    toPurchase({
      id: 'r1', market_id: 'US', amount_minor: 5_000, currency: 'USD', recipient_name: null, message: null,
      status: 'paid', code: null, redeemed: false, reload: true, created_at: 'c', paid_at: 'p',
    }),
  ).toMatchObject({ reload: true, quantity: 1, code: null, codes: [] });
});

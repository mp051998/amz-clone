import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { balanceHistory, formatGiftCode, isBalanceMethod, redeemGiftCard, storeBalance } from './balance';
import { DataError } from './errors';

type Reply = { data: unknown; error: unknown };

/** A client whose every query and RPC answers with `reply`, recording RPC calls. */
function fakeDb(reply: Reply) {
  const rpcs: [string, unknown][] = [];
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) query[m] = () => query;
  query.maybeSingle = async () => reply;
  query.then = (resolve: (r: Reply) => unknown) => resolve(reply);
  const db = {
    from: () => query,
    rpc: async (fn: string, args: unknown) => (rpcs.push([fn, args]), reply),
  };
  return { db: db as unknown as Db, rpcs };
}

it('only the store balance methods are paid from the balance', () => {
  expect(isBalanceMethod('giftcard')).toBe(true);
  expect(isBalanceMethod('amazonpay')).toBe(true);
  expect(isBalanceMethod('card')).toBe(false);
  expect(isBalanceMethod('cod')).toBe(false);
});

it('formats a typed code, and leaves anything else as typed', () => {
  expect(formatGiftCode('a1b2 c3d4e5 f6a7')).toBe('A1B2-C3D4E5-F6A7');
  expect(formatGiftCode('A1B2-C3D4E5-F6A7')).toBe('A1B2-C3D4E5-F6A7');
  expect(formatGiftCode('  abc ')).toBe('abc');
  expect(formatGiftCode(undefined)).toBe('');
});

it('reads the balance: 0 before the first card, null when it can’t be read', async () => {
  expect(await storeBalance(fakeDb({ data: { balance_minor: 4250 }, error: null }).db, 'US')).toBe(4250);
  expect(await storeBalance(fakeDb({ data: null, error: null }).db, 'US')).toBe(0);
  // signed out, or before the migration
  expect(await storeBalance(fakeDb({ data: null, error: { code: '42P01', message: 'relation does not exist' } }).db, 'US')).toBeNull();
});

it('maps the history, and an unreadable one is empty', async () => {
  const row = { id: 7, amount_minor: -1299, kind: 'order', order_id: '113-0000001-0000001', gift_card_code: null, created_at: '2026-10-06T10:00:00Z' };
  expect(await balanceHistory(fakeDb({ data: [row], error: null }).db, 'US')).toEqual([
    { id: 7, amountMinor: -1299, kind: 'order', orderId: '113-0000001-0000001', giftCardCode: null, at: '2026-10-06T10:00:00Z' },
  ]);
  expect(await balanceHistory(fakeDb({ data: null, error: { code: '42501', message: 'permission denied' } }).db, 'US')).toEqual([]);
});

it('redeems through the RPC; a blank code never reaches it', async () => {
  const ok = fakeDb({ data: { amount_minor: 10000, balance_minor: 12500 }, error: null });
  expect(await redeemGiftCard(ok.db, 'US', ' a1b2-c3d4e5-f6a7 ')).toEqual({ amountMinor: 10000, balanceMinor: 12500 });
  expect(ok.rpcs).toEqual([['redeem_gift_card', { p_market: 'US', p_code: 'a1b2-c3d4e5-f6a7' }]]);

  const blank = fakeDb({ data: null, error: null });
  await expect(redeemGiftCard(blank.db, 'US', '  ')).rejects.toMatchObject({ code: 'invalid_input', detail: 'code' });
  expect(blank.rpcs).toEqual([]);

  const used = fakeDb({ data: null, error: { code: 'P0001', message: 'gift_card_redeemed' } });
  const err = await redeemGiftCard(used.db, 'US', 'A1B2-C3D4E5-F6A7').catch((e) => e);
  expect(err).toBeInstanceOf(DataError);
  expect(err).toMatchObject({ code: 'gift_card_redeemed' });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const signIn = vi.fn();
vi.mock('@/lib/api/auth', () => ({
  authClient: () => ({ auth: { signInWithPassword: signIn, signOut: vi.fn(async () => ({ error: null })) } }),
}));

import { closeAccount, closureBlockers, closureMessage, listPhrase, type ClosureCheck } from './account';
import { DataError } from './errors';
import type { Db } from '@/lib/db/client';

const open = (over: Partial<ClosureCheck> = {}): ClosureCheck => ({
  unpaidOrders: 0,
  openOrders: 0,
  openReturns: 0,
  pendingRefunds: 0,
  giftCardCheckouts: 0,
  balances: [],
  ...over,
});

describe('what keeps an account open', () => {
  it('nothing, once everything has arrived and settled', () => {
    expect(closureBlockers(open())).toEqual([]);
    expect(closureMessage(open({ balances: [{ market: 'US', currency: 'USD', balanceMinor: 2500 }] }))).toBeNull();
  });

  it('names each thing still open', () => {
    expect(closureBlockers(open({ unpaidOrders: 1, openOrders: 2, openReturns: 1, pendingRefunds: 2, giftCardCheckouts: 1 }))).toEqual([
      '1 unpaid order to pay for or cancel',
      '2 orders on the way',
      '1 return in progress',
      '2 refunds on their way',
      '1 gift card checkout still open',
    ]);
    expect(closureMessage(open({ openOrders: 1, pendingRefunds: 1 }))).toBe(
      'You can’t close your account yet: you have 1 order on the way and 1 refund on its way.',
    );
  });

  it('joins phrases the way people write them', () => {
    expect(listPhrase([])).toBe('');
    expect(listPhrase(['a'])).toBe('a');
    expect(listPhrase(['a', 'b'])).toBe('a and b');
    expect(listPhrase(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('closeAccount', () => {
  const me = { id: 'u1', email: 'me@example.test' };
  const deleteUser = vi.fn(async () => ({ data: {}, error: null as null | { code?: string; message: string } }));
  const service = { auth: { admin: { deleteUser } } } as never;
  const dbWith = (check: Partial<ClosureCheck>) =>
    ({ rpc: vi.fn(async () => ({ data: { ...open(), ...check }, error: null })) }) as unknown as Db;

  beforeEach(() => {
    signIn.mockReset();
    deleteUser.mockClear();
  });

  const failure = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (err) {
      return err instanceof DataError ? `${err.code}:${err.detail ?? ''}:${err.message}` : String(err);
    }
    return 'no error';
  };

  it('deletes the auth user once the password checks out and nothing is open', async () => {
    signIn.mockResolvedValue({ error: null });
    const db = dbWith({});
    await closeAccount(service, db, me, { currentPassword: 'secret-1' });
    expect(signIn).toHaveBeenCalledWith({ email: 'me@example.test', password: 'secret-1' });
    expect(db.rpc).toHaveBeenCalledWith('account_closure_check');
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });

  it('needs the current password', async () => {
    signIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    expect(await failure(closeAccount(service, dbWith({}), me, { currentPassword: 'wrong' }))).toBe(
      'invalid_input:currentPassword:That isn’t your current password.',
    );
    expect(await failure(closeAccount(service, dbWith({}), me, { currentPassword: '' }))).toMatch(/^invalid_input:currentPassword/);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('refuses while an order is on the way, saying so', async () => {
    signIn.mockResolvedValue({ error: null });
    expect(await failure(closeAccount(service, dbWith({ openOrders: 1 }), me, { currentPassword: 'secret-1' }))).toBe(
      'account_not_closable::You can’t close your account yet: you have 1 order on the way.',
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('reports an Auth failure as internal', async () => {
    signIn.mockResolvedValue({ error: null });
    deleteUser.mockResolvedValueOnce({ data: {}, error: { code: 'unexpected_failure', message: 'boom' } });
    expect(await failure(closeAccount(service, dbWith({}), me, { currentPassword: 'secret-1' }))).toMatch(/^internal:close account: unexpected_failure boom/);
  });
});

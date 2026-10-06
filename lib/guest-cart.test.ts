import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ token: null as string | null, fail: false, calls: [] as string[] }));

vi.mock('server-only', () => ({}));
vi.mock('./supabase/server', () => ({ db: async () => ({}) }));
vi.mock('./session', () => ({
  readGuestToken: async () => state.token,
  clearGuestToken: async () => void state.calls.push('clear'),
}));
vi.mock('./data/cart', () => ({
  mergeGuestCart: async (_db: unknown, token: string) => {
    if (state.fail) throw new Error('db down');
    state.calls.push(`merge ${token}`);
  },
}));

const { adoptGuestCart } = await import('./guest-cart');

beforeEach(() => {
  state.token = null;
  state.fail = false;
  state.calls = [];
});

it('merges the guest cart and drops the cookie', async () => {
  state.token = 'g1';
  await adoptGuestCart();
  expect(state.calls).toEqual(['merge g1', 'clear']);
});

it('does nothing without a guest cart', async () => {
  await adoptGuestCart();
  expect(state.calls).toEqual([]);
});

it('keeps the cookie when the merge fails, so a later sign-in can retry', async () => {
  state.token = 'g1';
  state.fail = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await adoptGuestCart();
  expect(state.calls).toEqual([]);
});

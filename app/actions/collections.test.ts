import { beforeEach, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/data/errors';

const state = vi.hoisted(() => ({ user: { id: 'u1' } as unknown, calls: [] as string[], addFails: null as Error | null }));

vi.mock('next/cache', () => ({ revalidatePath: () => state.calls.push('revalidate') }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/session', () => ({ getMarket: async () => 'IN', readGuestToken: async () => null }));
vi.mock('@/lib/data/cart', () => ({
  addToCart: async (_db: unknown, market: string, id: string, qty: number, token: unknown) => {
    if (state.addFails) throw state.addFails;
    state.calls.push(`add ${market} ${id} x${qty} ${token}`);
  },
  setCartQty: async () => {},
}));
vi.mock('@/lib/data/collections', () => ({
  removeItem: async (_db: unknown, cid: string, id: string) => void state.calls.push(`remove ${cid} ${id}`),
}));

const { moveSavedToCart } = await import('./collections');

beforeEach(() => {
  state.user = { id: 'u1' };
  state.calls = [];
  state.addFails = null;
});

it('puts one in the cart, then takes it off the list', async () => {
  expect(await moveSavedToCart('c1', 'p1')).toEqual({ ok: true });
  expect(state.calls).toEqual(['add IN p1 x1 null', 'remove c1 p1', 'revalidate']);
});

it('keeps it saved when it cannot go in the cart', async () => {
  state.addFails = new DataError('out_of_stock', undefined, 'Only 0 left.');
  expect(await moveSavedToCart('c1', 'p1')).toEqual({ error: 'out_of_stock', message: 'Only 0 left.' });
  expect(state.calls).toEqual([]);
});

it('needs a signed-in shopper', async () => {
  state.user = null;
  expect(await moveSavedToCart('c1', 'p1')).toEqual({ error: 'not_authenticated' });
  expect(state.calls).toEqual([]);
});

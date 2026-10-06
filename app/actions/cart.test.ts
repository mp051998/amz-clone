import { beforeEach, expect, it, vi } from 'vitest';
import { DataError } from '@/lib/data/errors';

const state = vi.hoisted(() => ({ fails: {} as Record<string, string>, calls: [] as string[] }));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock('@/lib/auth', () => ({ readUser: async () => ({ id: 'u1' }) }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/session', () => ({ getMarket: async () => 'IN', ensureGuestToken: async () => 'g' }));
vi.mock('@/lib/data/cart', () => {
  const run = (what: string, id: string) => {
    if (state.fails[id]) throw new DataError(state.fails[id]);
    state.calls.push(`${what} ${id}`);
  };
  return {
    addToCart: async (_db: unknown, _m: string, id: string) => run('add', id),
    setCartQty: async (_db: unknown, _m: string, id: string, qty: number) => run(`set x${qty}`, id),
    selectCartLines: async (_db: unknown, _m: string, id: string | null, on: boolean) => run(on ? 'tick' : 'untick', id ?? 'all'),
  };
});

const { addBundle, buyNow, removeItem, selectItems, updateQty } = await import('./cart');

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

beforeEach(() => {
  state.fails = {};
  state.calls = [];
});

it('changes a quantity quietly when it works', async () => {
  await updateQty(form([['id', 'p1'], ['qty', '3']]));
  await removeItem(form([['id', 'p2']]));
  expect(state.calls).toEqual(['set x3 p1', 'set x0 p2']);
});

it('says why when a quantity change fails', async () => {
  state.fails.p1 = 'insufficient_stock';
  await expect(updateQty(form([['id', 'p1'], ['qty', '9']]))).rejects.toThrow('REDIRECT /in/cart?error=insufficient_stock');
  state.fails.p2 = 'product_unavailable';
  await expect(removeItem(form([['id', 'p2']]))).rejects.toThrow('REDIRECT /in/cart?error=product_unavailable');
});

it('a bundle that only partly went in says how much was left out', async () => {
  state.fails.b = 'out_of_stock';
  await expect(addBundle(form([['id', 'a'], ['id', 'b'], ['id', 'c'], ['from', 'a']]))).rejects.toThrow('REDIRECT /in/cart?skipped=1&error=out_of_stock');
  expect(state.calls).toEqual(['add a', 'add c']);
});

it('a bundle that fully went in, or not at all', async () => {
  await expect(addBundle(form([['id', 'a'], ['id', 'b'], ['from', 'a']]))).rejects.toThrow(/^REDIRECT \/in\/cart$/);
  state.fails = { a: 'out_of_stock', b: 'out_of_stock' };
  await expect(addBundle(form([['id', 'a'], ['id', 'b'], ['from', 'a']]))).rejects.toThrow('REDIRECT /in/product/a?error=out_of_stock');
});

it('Buy Now opens checkout for just that product, without touching the cart', async () => {
  await expect(buyNow(form([['id', 'k 1'], ['qty', '2']]))).rejects.toThrow(/^REDIRECT \/in\/checkout\?buy=k\+1&qty=2$/);
  await expect(buyNow(form([['id', 'k1']]))).rejects.toThrow(/^REDIRECT \/in\/checkout\?buy=k1&qty=1$/);
  await expect(buyNow(form([]))).rejects.toThrow(/^REDIRECT \/in\/cart$/);
  expect(state.calls).toEqual([]);
});

it('ticks or unticks one line, or every line when no product is named', async () => {
  await selectItems(form([['id', 'p1'], ['selected', '0']]));
  await selectItems(form([['id', 'p1'], ['selected', '1']]));
  await selectItems(form([['selected', '0']]));
  expect(state.calls).toEqual(['untick p1', 'tick p1', 'untick all']);
  state.fails.gone = 'not_in_cart';
  await expect(selectItems(form([['id', 'gone'], ['selected', '1']]))).rejects.toThrow('REDIRECT /in/cart?error=not_in_cart');
});

import { expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { Product } from '@/lib/types';

const state = vi.hoisted(() => ({ store: null as unknown, alternativesOf: [] as string[] }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/ai/features/compare', () => ({ compareVerdictAI: async () => null }));
vi.mock('@/lib/data/insights', () => ({ getInsights: async () => new Map() }));
vi.mock('@/lib/data/catalog', () => ({
  // only the cart item is known; an already-picked compare renders its empty state
  getProducts: async (_db: unknown, ids: string[]) => ids.filter((id) => id === 'us-kettle').map((id) => ({ id, market: 'US' }) as Product),
}));
vi.mock('@/lib/decision/server', () => ({
  alternativesFor: async (p: Product) => {
    state.alternativesOf.push(p.id);
    return [{ product: { id: 'us-alt1' } }, { product: { id: 'us-alt2' } }];
  },
}));

import ComparePage from './page';

const open = (sp: Record<string, string>) => ComparePage({ searchParams: Promise.resolve(sp) });

it('compares a cart item with the items most like it (similar=)', async () => {
  state.store = amazon;
  await expect(open({ similar: 'us-kettle' })).rejects.toThrow('REDIRECT /compare?ids=us-kettle,us-alt1,us-alt2');
  expect(state.alternativesOf).toEqual(['us-kettle']);
});

it('keeps to the store, and leaves a compare already picked alone', async () => {
  state.store = amazonIn;
  await expect(open({ similar: 'us-kettle' })).rejects.toThrow('REDIRECT /in/compare');
  await expect(open({ similar: 'bad id!' })).resolves.toBeTruthy();
  state.store = amazon;
  await expect(open({ similar: 'us-kettle', ids: 'us-a,us-b' })).resolves.toBeTruthy();
});

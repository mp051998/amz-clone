import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COD_MAX_MINOR } from '@/lib/cod';
import type { SearchQuery } from '@/lib/search';
import type { ParsedQuery } from './types';

const searchCatalog = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('../supabase/server', () => ({ db: async () => ({}) }));
vi.mock('../data/catalog', () => ({ searchCatalog, getProducts: async () => [], listProducts: async () => [] }));
vi.mock('../data/insights', () => ({ getInsight: async () => null, getInsights: async () => new Map() }));
vi.mock('../data/offers', () => ({ buyingChoices: async () => new Map() }));

import { rankedSearch } from './server';

const query = { keywords: 'mixer', category: null, budgetMinor: null, use: null, intents: [], source: 'rules' } as unknown as ParsedQuery;
const asked = () => searchCatalog.mock.calls.map((c) => c[2] as SearchQuery);

beforeEach(() => {
  searchCatalog.mockReset();
  searchCatalog.mockResolvedValue({ items: [], total: 0, pageCount: 1, unavailable: 0 });
});

describe('rankedSearch Pay On Delivery', () => {
  it('caps the price at the Pay on Delivery ceiling', async () => {
    await rankedSearch('IN', query, null, null, { cod: true }, {} as never);
    expect(asked()[0].maxPrice).toBe(COD_MAX_MINOR);
  });

  it('keeps a lower budget, and caps a higher one', async () => {
    await rankedSearch('IN', query, null, 300_000, { cod: true }, {} as never);
    expect(asked()[0].maxPrice).toBe(300_000);
    searchCatalog.mockClear();
    await rankedSearch('IN', query, null, COD_MAX_MINOR * 2, { cod: true }, {} as never);
    expect(asked()[0].maxPrice).toBe(COD_MAX_MINOR);
  });

  it('says nothing’s in the price range only against what Pay on Delivery allows', async () => {
    await rankedSearch('IN', query, null, 300_000, { cod: true }, {} as never);
    // the candidates, then the same search at any price the shopper set
    expect(asked()).toHaveLength(2);
    expect(asked()[1].maxPrice).toBe(COD_MAX_MINOR);
  });

  it('leaves the price open without it', async () => {
    await rankedSearch('IN', query, null, null, {}, {} as never);
    expect(asked()[0].maxPrice).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { chart, giftIdeas, isChartKind, mostWishedFor, moversAndShakers } from './catalog';

const row = (id: string, group: string | null = null) => ({ id, market_id: 'US', title: id, category_slug: 'kitchen', price_minor: 1000, variant_group: group, variant_axis: group ? 'Color' : null, variant_label: group ? id : null });

/** A client whose ranking RPC answers `ranking`, with `listed` as the bestsellers and every row readable by id. */
function fakeDb(ranking: { data: string[] | null; error: { code: string; message: string } | null }, listed: ReturnType<typeof row>[], all = listed, calls: string[] = []) {
  const query = () => {
    let ids: string[] | null = null;
    const q = {
      select: () => q,
      eq: () => q,
      neq: () => q,
      not: () => q,
      order: () => q,
      limit: () => q,
      in: (_col: string, v: string[]) => ((ids = v), q),
      then: (resolve: (r: unknown) => void) => resolve({ data: ids ? all.filter((r) => ids!.includes(r.id)) : listed, error: null }),
    };
    return q;
  };
  return { rpc: async (name: string) => (calls.push(name), ranking), from: query } as unknown as Db;
}

describe('mostWishedFor', () => {
  it('wished products first, in rank order, then bestsellers they don’t repeat', async () => {
    const listed = [row('p1'), row('w2'), row('p3', 'g'), row('p4')];
    const all = [...listed, row('w1', 'g')];
    const chart = await mostWishedFor(fakeDb({ data: ['w1', 'w2'], error: null }, listed, all), 'US', { limit: 4 });
    // p3 is another option of w1's group, so the group shows once, at w1
    expect(chart.map((p) => p.id)).toEqual(['w1', 'w2', 'p1', 'p4']);
  });

  it('the bestsellers stand in until the ranking is deployed', async () => {
    const chart = await mostWishedFor(fakeDb({ data: null, error: { code: 'PGRST202', message: 'not found' } }, [row('p1'), row('p2')]), 'US');
    expect(chart.map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});

describe('giftIdeas', () => {
  it('ranks by the gift ranking, then fills with bestsellers', async () => {
    const calls: string[] = [];
    const listed = [row('p1'), row('g1')];
    const chart = await giftIdeas(fakeDb({ data: ['g1'], error: null }, listed, listed, calls), 'US', { limit: 3 });
    expect(calls).toEqual(['gift_ideas']);
    expect(chart.map((p) => p.id)).toEqual(['g1', 'p1']);
  });
});

describe('chart', () => {
  it('serves each chart by its path', async () => {
    const listed = [row('p1'), row('p2')];
    for (const [kind, rpc] of [['bestsellers', []], ['new-releases', []], ['most-wished-for', ['most_wished_for']], ['gift-ideas', ['gift_ideas']]] as const) {
      const calls: string[] = [];
      const items = await chart(fakeDb({ data: [], error: null }, listed, listed, calls), 'US', kind, { limit: 2 });
      expect(calls).toEqual(rpc);
      expect(items.map((p) => p.id)).toEqual(['p1', 'p2']);
    }
    expect(isChartKind('gift-ideas')).toBe(true);
    expect(isChartKind('movers-and-shakers')).toBe(true);
    expect(isChartKind('hot-new')).toBe(false);
  });

  it('serves movers & shakers as ranked, with no bestsellers to fill it', async () => {
    const calls: string[] = [];
    const ranks = [{ product_id: 'p2', rank: 1, was_rank: 5 }];
    const items = await chart(fakeDb({ data: ranks, error: null } as never, [row('p1'), row('p2')], undefined, calls), 'US', 'movers-and-shakers', { limit: 2 });
    expect(calls).toEqual(['movers_and_shakers']);
    expect(items.map((p) => p.id)).toEqual(['p2']);
  });
});

describe('moversAndShakers', () => {
  const ranking = (data: unknown) => ({ data, error: null }) as never;

  it('keeps the database’s order and ranks, one option per variant group, leaving out what can’t be read', async () => {
    const all = [row('m1'), row('m2', 'g'), row('m3', 'g'), row('m4')];
    const movers = await moversAndShakers(
      fakeDb(ranking([
        { product_id: 'm2', rank: 2, was_rank: 40 },
        { product_id: 'gone', rank: 3, was_rank: null },
        { product_id: 'm1', rank: 1, was_rank: null },
        { product_id: 'm3', rank: 4, was_rank: 9 },
        { product_id: 'm4', rank: 5, was_rank: 6 },
      ]), [], all),
      'US',
    );
    expect(movers.map((m) => [m.product.id, m.rank, m.wasRank])).toEqual([
      ['m2', 2, 40],
      ['m1', 1, null],
      ['m4', 5, 6],
    ]);
  });

  it('is empty until the ranking is deployed, rather than bestsellers that didn’t climb', async () => {
    const movers = await moversAndShakers(fakeDb({ data: null, error: { code: 'PGRST202', message: 'not found' } }, [row('p1')]), 'US');
    expect(movers).toEqual([]);
  });
});

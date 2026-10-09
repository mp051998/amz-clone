import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { getProductInfo } from './catalog';

type Reply = { data: unknown; error: unknown };

/** A client whose single-row products read answers `reply`, recording the columns asked for. */
function fakeDb(reply: Reply) {
  const selected: string[] = [];
  const q: Record<string, unknown> = {
    select: (cols: string) => (selected.push(cols), q),
    eq: () => q,
    maybeSingle: async () => reply,
  };
  return { db: { from: () => q } as unknown as Db, selected };
}

const row = { market_id: 'US', description: 'Folds flat.', details: [['Weight', '250 g']], gallery: [], variant_group: null, variant_axis: null, variant_label: null };

it('reads when the product was first listed', async () => {
  const { db, selected } = fakeDb({ data: { ...row, created_at: '2026-09-26T00:00:00+00:00' }, error: null });
  const info = await getProductInfo(db, 'p1');
  expect(selected[0]).toContain('created_at');
  expect(info.firstAvailable).toBe('2026-09-26T00:00:00+00:00');
  expect(info.description).toBe('Folds flat.');
});

it('knows no listing date for an unknown product', async () => {
  const { db } = fakeDb({ data: null, error: null });
  expect((await getProductInfo(db, 'nope')).firstAvailable).toBeNull();
});

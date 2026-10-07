import { expect, it } from 'vitest';
import type { Db } from '../db/client';
import { recordSearch, relatedSearches } from './search-terms';

function fakeDb(result: { data?: unknown; error?: unknown } | Error) {
  const calls: [string, object][] = [];
  const db = {
    rpc: async (fn: string, args: object) => {
      calls.push([fn, args]);
      if (result instanceof Error) throw result;
      return { data: result.data ?? null, error: result.error ?? null };
    },
  } as unknown as Db;
  return { db, calls };
}

it('records a search as typed, trimmed, for the store', async () => {
  const { db, calls } = fakeDb({});
  await recordSearch(db, 'IN', '  Wireless Earbuds ');
  expect(calls).toEqual([['record_search', { p_market: 'IN', p_q: 'Wireless Earbuds' }]]);
});

it('skips a search too short to count, and never throws', async () => {
  const short = fakeDb({});
  await recordSearch(short.db, 'US', ' a ');
  expect(short.calls).toHaveLength(0);
  await expect(recordSearch(fakeDb(new Error('offline')).db, 'US', 'lamp')).resolves.toBeUndefined();
  await expect(recordSearch(fakeDb({ error: { code: '42501' } }).db, 'US', 'lamp')).resolves.toBeUndefined();
});

it('lists related searches in the order given, without repeats or blanks', async () => {
  const { db, calls } = fakeDb({ data: ['wireless headphones', 'earbuds with mic', 'wireless headphones', '', 7] });
  expect(await relatedSearches(db, 'US', 'wireless earbuds')).toEqual(['wireless headphones', 'earbuds with mic']);
  expect(calls).toEqual([['related_searches', { p_market: 'US', p_q: 'wireless earbuds', p_limit: 8 }]]);
});

it('caps the list at the limit asked for', async () => {
  const { db } = fakeDb({ data: ['a1', 'a2', 'a3', 'a4'] });
  expect(await relatedSearches(db, 'US', 'aaa', 2)).toEqual(['a1', 'a2']);
});

it('is empty for a short search, an error, or a missing function', async () => {
  const short = fakeDb({ data: ['x'] });
  expect(await relatedSearches(short.db, 'US', 'a')).toEqual([]);
  expect(short.calls).toHaveLength(0);
  expect(await relatedSearches(fakeDb({ error: { code: 'PGRST202' } }).db, 'US', 'lamp')).toEqual([]);
  expect(await relatedSearches(fakeDb(new Error('offline')).db, 'US', 'lamp')).toEqual([]);
  expect(await relatedSearches(fakeDb({ data: { not: 'a list' } }).db, 'US', 'lamp')).toEqual([]);
});

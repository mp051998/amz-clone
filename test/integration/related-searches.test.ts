import { beforeAll, describe, expect, it } from 'vitest';
import { recordSearch, relatedSearches } from '@/lib/data/search-terms';
import { admin, anon } from './helpers';

const TERMS = ['pressure cooker', 'hawkins pressure cooker', 'hawkins cooker', 'prestige pressure cooker', 'cooker pressure', 'zzqx flurb', 'hawkins'];

async function search(market: 'US' | 'IN', q: string, times: number) {
  for (let i = 0; i < times; i++) await recordSearch(anon(), market, q);
}

async function searchesOf(market: 'US' | 'IN', term: string): Promise<number> {
  const { data } = await admin().from('search_terms').select('searches').eq('market_id', market).eq('term', term).maybeSingle();
  return data?.searches ?? 0;
}

describe('related searches', () => {
  beforeAll(async () => {
    await admin().from('search_terms').delete().in('term', TERMS);
    await search('IN', 'Hawkins  Pressure-Cooker!', 3); // the same search as "hawkins pressure cooker"
    await search('IN', 'hawkins cooker', 4);
    await search('IN', 'prestige pressure cooker', 2);
    await search('IN', 'cooker pressure', 3);
    await search('IN', 'zzqx flurb', 3);
    await search('US', 'hawkins', 3);
  });

  it('counts searches as search compares them, only when they find something in the store', async () => {
    expect(await searchesOf('IN', 'hawkins pressure cooker')).toBe(3);
    expect(await searchesOf('IN', 'zzqx flurb')).toBe(0);
    // Hawkins is only sold in India
    expect(await searchesOf('US', 'hawkins')).toBe(0);
  });

  it('skips searches too short or too long to suggest', async () => {
    const { error } = await anon().rpc('record_search', { p_market: 'IN', p_q: 'hawkins pressure cooker steel lid induction silver' });
    expect(error).toBeNull();
    expect(await searchesOf('IN', 'hawkins pressure cooker steel lid induction silver')).toBe(0);
    await anon().rpc('record_search', { p_market: 'IN', p_q: 'h!' });
    expect(await searchesOf('IN', 'h')).toBe(0);
  });

  it('suggests other searches made 3+ times that share a word, most words in common first', async () => {
    expect(await relatedSearches(anon(), 'IN', 'Pressure cooker')).toEqual(['hawkins pressure cooker', 'hawkins cooker']);
    // two searches isn't enough yet; at three it ties, and the more recent search goes first
    await search('IN', 'prestige pressure cooker', 1);
    expect(await relatedSearches(anon(), 'IN', 'pressure cooker')).toEqual(['prestige pressure cooker', 'hawkins pressure cooker', 'hawkins cooker']);
  });

  it('leaves out the search itself, the same words in another order, and other stores', async () => {
    const related = await relatedSearches(anon(), 'IN', 'hawkins pressure cooker');
    expect(related).not.toContain('hawkins pressure cooker');
    expect(related).toContain('hawkins cooker');
    expect(await relatedSearches(anon(), 'IN', 'pressure cooker')).not.toContain('cooker pressure');
    expect(await relatedSearches(anon(), 'US', 'pressure cooker')).toEqual([]);
    expect(await relatedSearches(anon(), 'IN', 'a b')).toEqual([]);
  });

  it('keeps the log itself from shoppers', async () => {
    const read = await anon().from('search_terms').select('term').limit(1);
    expect(read.error?.code).toBe('42501');
    const write = await anon().from('search_terms').insert({ market_id: 'IN', term: 'pressure' });
    expect(write.error?.code).toBe('42501');
  });
});

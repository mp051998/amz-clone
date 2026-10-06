import { beforeEach, describe, expect, it } from 'vitest';
import { clearVocabCache, spellFix, storeVocab } from '@/lib/data/spell';
import { anon } from './helpers';

beforeEach(clearVocabCache);

describe('search spelling correction', () => {
  it("builds each store's word list from titles, brands and departments", async () => {
    const us = await storeVocab(anon(), 'US');
    const ind = await storeVocab(anon(), 'IN');
    expect(us.get('headphones')).toBeGreaterThan(1);
    expect(us.has('sony')).toBe(true);
    expect(us.has('electronics')).toBe(true);
    expect(ind.has('pressure')).toBe(true);
    expect(ind.has('boat')).toBe(true);
  });

  it('corrects typos to words that find products, keeping the rest of the query', async () => {
    expect(await spellFix(anon(), 'US', 'wirless hedphones under $100', 'wirless hedphones')).toEqual({
      query: 'wireless headphones under $100',
      keywords: 'wireless headphones',
    });
    expect(await spellFix(anon(), 'IN', 'presure coker', 'presure coker')).toEqual({ query: 'pressure cooker', keywords: 'pressure cooker' });
  });

  it('offers nothing when the words already match, nothing is close, or the fix finds nothing in the department', async () => {
    expect(await spellFix(anon(), 'US', 'headphones', 'headphones')).toBeNull();
    expect(await spellFix(anon(), 'US', 'zzqxv blorf', 'zzqxv blorf')).toBeNull();
    expect(await spellFix(anon(), 'US', 'hedphones', 'hedphones', 'books')).toBeNull();
    expect(await spellFix(anon(), 'US', 'cheap', '')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { suggestSearch } from '@/lib/data/catalog';
import { NO_SUGGESTIONS } from '@/lib/search';
import { anon } from './helpers';

const SONY = ['41lArSiD5hL', '41JACWTwWL'];

describe('search suggestions', () => {
  it('completes the last word and scopes it to departments', async () => {
    const s = await suggestSearch(anon(), 'US', 'Sony he');
    expect(s.terms[0]).toEqual({ text: 'sony headphones', count: 2 });
    expect(s.departments.map((d) => d.slug)).toEqual(['electronics']);
    expect(s.products.length).toBeGreaterThan(0);
    expect(s.products.length).toBeLessThanOrEqual(4);
    expect(s.products.every((p) => /sony/i.test(p.title))).toBe(true);
  });

  it('shows a variant group once and counts it once', async () => {
    const s = await suggestSearch(anon(), 'US', 'sony');
    expect(s.products.filter((p) => SONY.includes(p.id))).toHaveLength(1);
    expect(s.terms.find((t) => t.text === 'sony')?.count).toBe(s.total);
  });

  it('follows the top completion for departments', async () => {
    // "pres" also matches preschoolers' toys, but "pressure" only cookers
    const s = await suggestSearch(anon(), 'IN', 'pres');
    expect(s.terms[0].text).toBe('pressure');
    expect(s.departments.map((d) => d.slug)).toEqual(['home-kitchen']);
    expect(s.products.every((p) => p.id.startsWith('in-'))).toBe(true);
  });

  it('stays inside the store and skips short or empty input', async () => {
    expect((await suggestSearch(anon(), 'US', 'hawkins')).total).toBe(0);
    expect(await suggestSearch(anon(), 'US', 's')).toEqual(NO_SUGGESTIONS);
    expect(await suggestSearch(anon(), 'US', ' -- ')).toEqual(NO_SUGGESTIONS);
    const { data } = await anon().rpc('search_suggest', { p_market: 'US', p_q: 'a!' });
    expect(data).toEqual({ total: 0, terms: [], departments: [], products: [] });
  });

  it('takes punctuation and pattern characters as spaces', async () => {
    const s = await suggestSearch(anon(), 'US', 'sony.*(he');
    expect(s.terms[0]?.text).toBe('sony headphones');
  });
});

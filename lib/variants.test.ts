import { describe, expect, it } from 'vitest';
import type { Product } from './types';
import { foldVariants, optionCount, VISUAL_AXES } from './variants';

const product = (id: string, variant?: Product['variant'], market: Product['market'] = 'US') => ({ id, market, variant }) as Product;
const mug = (label: string) => ({ group: 'mug', axis: 'Color', label });

describe('foldVariants', () => {
  it('keeps the first option of each group, in order', () => {
    const items = [product('a'), product('sage', mug('Sage')), product('b'), product('clay', mug('Clay')), product('c')];
    expect(foldVariants(items).map((p) => p.id)).toEqual(['a', 'sage', 'b', 'c']);
  });

  it('keeps groups apart by store', () => {
    const items = [product('us', mug('Sage')), product('in', mug('Sage'), 'IN')];
    expect(foldVariants(items)).toHaveLength(2);
  });

  it('folds wrapped items by their product', () => {
    const ranked = [{ product: product('clay', mug('Clay')), match: 91 }, { product: product('sage', mug('Sage')), match: 88 }];
    expect(foldVariants(ranked, (r) => r.product)).toEqual([ranked[0]]);
  });
});

describe('optionCount', () => {
  it('counts options by their axis', () => {
    expect(optionCount('Color', 3)).toBe('3 colors');
    expect(optionCount('Size', 1)).toBe('1 size');
    expect(optionCount('Pack size', 2)).toBe('2 pack sizes');
    expect(optionCount('Capacity', 4)).toBe('4 capacities');
    expect(optionCount('Options', 2)).toBe('2 options');
  });

  it('treats looks as visual and the rest as text', () => {
    expect(['Color', 'colour', 'Pattern', 'Finish'].every((a) => VISUAL_AXES.test(a))).toBe(true);
    expect(['Size', 'Configuration', 'Capacity'].some((a) => VISUAL_AXES.test(a))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { slugify } from '../slugify';
import { storeNav, totalProducts, validateCategory, type AdminCategory } from './admin-categories';

describe('slugify', () => {
  it('lowercases, spells out &, and joins words with single hyphens', () => {
    expect(slugify('Garden & Outdoors')).toBe('garden-and-outdoors');
    expect(slugify('  Kids’ Toys -- 2026  ')).toBe('kids-toys-2026');
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('gives an empty slug when nothing usable is left', () => {
    expect(slugify('★★★')).toBe('');
  });

  it('keeps slugs to 40 characters without a trailing hyphen', () => {
    const s = slugify('Very long category name that keeps on going and going');
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s).not.toMatch(/-$/);
  });
});

describe('validateCategory', () => {
  it('derives the slug from the name when none is given', () => {
    expect(validateCategory({ name: ' Home Office ' })).toEqual({ ok: true, data: { name: 'Home Office', slug: 'home-office' } });
  });

  it('accepts a custom slug, lowercased', () => {
    expect(validateCategory({ name: 'Home Office', slug: 'WFH' })).toEqual({ ok: true, data: { name: 'Home Office', slug: 'wfh' } });
  });

  it('reports a missing name and a malformed slug', () => {
    expect(validateCategory({ name: '' })).toEqual({ ok: false, errors: { name: 'Enter a name' } });
    const bad = validateCategory({ name: 'Ok', slug: 'two  words' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors)).toEqual(['slug']);
    expect(validateCategory({ name: 'Ok', slug: 'trailing-' }).ok).toBe(false);
    expect(validateCategory({ name: '★★★' })).toEqual({ ok: false, errors: { slug: 'Use letters or numbers in the name, or enter a slug' } });
  });
});

const cat = (slug: string, us: number | null, inPos: number | null, products = [0, 0]): AdminCategory => ({
  slug,
  name: slug,
  tailored: false,
  stores: {
    US: { position: us, products: products[0], archived: 0, returnDays: null, replacementOnly: false },
    IN: { position: inPos, products: products[1], archived: 0, returnDays: null, replacementOnly: false },
  },
});

describe('storeNav / totalProducts', () => {
  it("orders a store's listed categories by position and skips the rest", () => {
    const all = [cat('b', 1, null), cat('a', 0, 2), cat('c', null, 0)];
    expect(storeNav(all, 'US').map((c) => c.slug)).toEqual(['a', 'b']);
    expect(storeNav(all, 'IN').map((c) => c.slug)).toEqual(['c', 'a']);
  });

  it('counts products in every store', () => {
    expect(totalProducts(cat('a', 0, 0, [3, 4]))).toBe(7);
    expect(totalProducts(cat('a', 0, null))).toBe(0);
  });
});

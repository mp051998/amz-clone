import { expect, it } from 'vitest';
import { promoProblem, promosFor, readPromoCode } from './promo';

it('reads a typed code trimmed and upper-cased, and blank as none', () => {
  expect(readPromoCode('  save10 ')).toBe('SAVE10');
  expect(readPromoCode('   ')).toBeNull();
  expect(readPromoCode(null)).toBeNull();
  expect(readPromoCode(42)).toBeNull();
  expect(readPromoCode('x'.repeat(60))).toHaveLength(40);
});

it('says how much to spend for a minimum-spend code, and the fallback otherwise', () => {
  const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;
  expect(promoProblem('promo_min_spend', '5000', money, 'nope')).toBe('Spend $50.00 or more on qualifying items to use that promotion code.');
  expect(promoProblem('promo_min_spend', undefined, money, 'nope')).toBe('nope');
  expect(promoProblem('promo_min_spend', 'abc', money, 'nope')).toBe('nope');
  expect(promoProblem('promo_used', '5000', money, 'used')).toBe('used');
});

it('picks the promotions for a product: store-wide and its own department, biggest first', () => {
  const promos = [
    { code: 'SAVE10', percentOff: 10 },
    { code: 'HOME15', percentOff: 15, category: { slug: 'home-kitchen' } },
    { code: 'STYLE20', percentOff: 20, category: { slug: 'fashion' } },
  ];
  expect(promosFor(promos, 'home-kitchen').map((p) => p.code)).toEqual(['HOME15', 'SAVE10']);
  expect(promosFor(promos, 'books').map((p) => p.code)).toEqual(['SAVE10']);
  expect(promosFor([], 'books')).toEqual([]);
});

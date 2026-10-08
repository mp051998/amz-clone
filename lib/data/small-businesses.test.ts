import { expect, it } from 'vitest';
import { parseQuery } from '../search';
import { toProduct } from './map';
import { parseSmallBusiness, SMALL_BUSINESS_STORY_MAX } from './small-businesses';

it('tidies a brand and its story', () => {
  expect(parseSmallBusiness({ brand: '  Smartivity ', story: ' STEM  building\nkits. ' })).toEqual({ brand: 'Smartivity', story: 'STEM building kits.' });
});

it('refuses a missing brand or story, or a story too long', () => {
  expect(() => parseSmallBusiness({ brand: ' ', story: 'x' })).toThrow(expect.objectContaining({ code: 'invalid_input', detail: 'brand' }));
  expect(() => parseSmallBusiness({ brand: 'Acme', story: '' })).toThrow(expect.objectContaining({ code: 'invalid_input', detail: 'story' }));
  expect(() => parseSmallBusiness({ brand: 'Acme', story: 'x'.repeat(SMALL_BUSINESS_STORY_MAX + 1) })).toThrow(expect.objectContaining({ detail: 'story' }));
  expect(() => parseSmallBusiness({ brand: 3, story: 'x' })).toThrow(expect.objectContaining({ detail: 'brand' }));
});

it('maps whether a catalog row is from a small business', () => {
  expect(toProduct({ id: 'a', small_business: true }).smallBusiness).toBe(true);
  expect(toProduct({ id: 'a', small_business: false })).not.toHaveProperty('smallBusiness');
  // rows read before the migration don't say
  expect(toProduct({ id: 'a' })).not.toHaveProperty('smallBusiness');
});

it('reads the search filter from small=1 only', () => {
  expect(parseQuery({ small: '1' }).smallBusiness).toBe(true);
  expect(parseQuery({ small: 'yes' }).smallBusiness).toBeUndefined();
  expect(parseQuery({}).smallBusiness).toBeUndefined();
});

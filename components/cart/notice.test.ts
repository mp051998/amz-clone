import { expect, it } from 'vitest';
import { cartNotice } from './notice';

it('says why a cart change failed', () => {
  expect(cartNotice('out_of_stock')).toBe('That item is out of stock.');
  expect(cartNotice(['product_unavailable', 'x'])).toBe('That item is no longer available.');
  expect(cartNotice('made_up_code')).toBe('That change didn’t go through. Please try again.');
  expect(cartNotice(undefined)).toBeNull();
  expect(cartNotice('')).toBeNull();
});

it('says how much of a bundle was left out', () => {
  expect(cartNotice('out_of_stock', '1')).toBe('One item from the bundle couldn’t be added. That item is out of stock.');
  expect(cartNotice('out_of_stock', '2')).toBe('2 items from the bundle couldn’t be added. That item is out of stock.');
  expect(cartNotice('out_of_stock', 'lots')).toBe('That item is out of stock.');
  expect(cartNotice('out_of_stock', '0')).toBe('That item is out of stock.');
});

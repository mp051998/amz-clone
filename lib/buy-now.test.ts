import { expect, it } from 'vitest';
import { buyNowQuery, readBuyNow } from './buy-now';

it('reads the product and a whole quantity of at least 1', () => {
  expect(readBuyNow(' k1 ', '3')).toEqual({ productId: 'k1', qty: 3 });
  expect(readBuyNow('k1', null)).toEqual({ productId: 'k1', qty: 1 });
  expect(readBuyNow('k1', '0')).toEqual({ productId: 'k1', qty: 1 });
  expect(readBuyNow('k1', '2.5')).toEqual({ productId: 'k1', qty: 1 });
  expect(readBuyNow('k1', '5000')).toEqual({ productId: 'k1', qty: 99 });
});

it('no product, no Buy Now', () => {
  expect(readBuyNow('', '1')).toBeNull();
  expect(readBuyNow('   ', '1')).toBeNull();
  expect(readBuyNow(null, '1')).toBeNull();
  expect(readBuyNow(['k1'], '1')).toBeNull();
  expect(readBuyNow('x'.repeat(121), '1')).toBeNull();
});

it('round-trips through the checkout query', () => {
  const q = new URLSearchParams(buyNowQuery({ productId: 'k 1&x', qty: 2 }));
  expect(readBuyNow(q.get('buy'), q.get('qty'))).toEqual({ productId: 'k 1&x', qty: 2 });
});

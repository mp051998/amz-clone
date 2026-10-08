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
  expect(q.has('protection')).toBe(false);
  expect(readBuyNow(q.get('buy'), q.get('qty'), q.get('protection'))).toEqual({ productId: 'k 1&x', qty: 2 });
});

it('carries the protection plan when asked for', () => {
  const q = new URLSearchParams(buyNowQuery({ productId: 'k1', qty: 1, protection: true }));
  expect(q.get('protection')).toBe('1');
  expect(readBuyNow(q.get('buy'), q.get('qty'), q.get('protection'))).toEqual({ productId: 'k1', qty: 1, protection: true });
  expect(readBuyNow('k1', '1', 'on')).toEqual({ productId: 'k1', qty: 1, protection: true });
  expect(readBuyNow('k1', '1', true)).toEqual({ productId: 'k1', qty: 1, protection: true });
  expect(readBuyNow('k1', '1', '0')).toEqual({ productId: 'k1', qty: 1 });
  expect(readBuyNow('k1', '1', null)).toEqual({ productId: 'k1', qty: 1 });
});

it('carries the size picked, trimmed, and drops a blank or overlong one', () => {
  const q = new URLSearchParams(buyNowQuery({ productId: 'k1', qty: 1, size: 'UK 8' }));
  expect(q.get('size')).toBe('UK 8');
  expect(readBuyNow(q.get('buy'), q.get('qty'), q.get('protection'), q.get('size'))).toEqual({ productId: 'k1', qty: 1, size: 'UK 8' });
  expect(readBuyNow('k1', '1', null, ' M ')).toEqual({ productId: 'k1', qty: 1, size: 'M' });
  expect(readBuyNow('k1', '1', null, '  ')).toEqual({ productId: 'k1', qty: 1 });
  expect(readBuyNow('k1', '1', null, 'x'.repeat(13))).toEqual({ productId: 'k1', qty: 1 });
  expect(readBuyNow('k1', '1', null, ['M'])).toEqual({ productId: 'k1', qty: 1 });
  expect(new URLSearchParams(buyNowQuery({ productId: 'k1', qty: 1 })).has('size')).toBe(false);
});

it('carries an old device traded in, for one unit', () => {
  const b = readBuyNow('k1', '3', null, null, 'apple-iphone-13', 'screen_damaged');
  expect(b).toEqual({ productId: 'k1', qty: 1, exchange: { deviceId: 'apple-iphone-13', condition: 'screen_damaged' } });
  const q = new URLSearchParams(buyNowQuery(b!));
  expect([q.get('exchange'), q.get('condition')]).toEqual(['apple-iphone-13', 'screen_damaged']);
  expect(readBuyNow(q.get('buy'), q.get('qty'), q.get('protection'), q.get('size'), q.get('exchange'), q.get('condition'))).toEqual(b);
  // without a known condition there's no exchange, and the quantity stands
  expect(readBuyNow('k1', '3', null, null, 'apple-iphone-13', 'mint')).toEqual({ productId: 'k1', qty: 3 });
  expect(new URLSearchParams(buyNowQuery({ productId: 'k1', qty: 2 })).has('exchange')).toBe(false);
});

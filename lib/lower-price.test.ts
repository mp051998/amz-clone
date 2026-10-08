import { describe, expect, it } from 'vitest';
import { checkLowerPrice, priceMinorOf, reportTotal, siteOf } from './lower-price';

const today = '2026-10-08';
const online = { seenAt: 'online', priceMinor: 7999, shippingMinor: 499, url: ' https://www.example.com/kettle?id=1 ' };
const shop = { seenAt: 'store', priceMinor: 7999, store: ' Best Buy ', city: ' Austin ', seenOn: '2026-10-06' };

describe('checkLowerPrice', () => {
  it('takes a price seen online, with what delivery cost', () => {
    expect(checkLowerPrice(online, { ourPriceMinor: 9999, today })).toEqual({
      input: { seenAt: 'online', priceMinor: 7999, shippingMinor: 499, url: 'https://www.example.com/kettle?id=1', store: null, city: null, seenOn: null },
    });
    // delivery blank or missing is free
    expect(checkLowerPrice({ ...online, shippingMinor: '' }, { today })).toMatchObject({ input: { shippingMinor: 0 } });
    expect(checkLowerPrice({ ...online, shippingMinor: undefined }, { today })).toMatchObject({ input: { shippingMinor: 0 } });
  });

  it('takes a price seen in a shop, with the day and an optional town', () => {
    expect(checkLowerPrice(shop, { ourPriceMinor: 9999, today })).toEqual({
      input: { seenAt: 'store', priceMinor: 7999, shippingMinor: 0, url: null, store: 'Best Buy', city: 'Austin', seenOn: '2026-10-06' },
    });
    expect(checkLowerPrice({ ...shop, city: '  ', shippingMinor: 500 }, { today })).toMatchObject({ input: { city: null, shippingMinor: 0 } });
  });

  it('says what’s wrong, one field at a time', () => {
    const field = (raw: Record<string, unknown>, ourPriceMinor?: number) => {
      const r = checkLowerPrice(raw, { ourPriceMinor, today });
      return 'field' in r ? r.field : 'ok';
    };
    expect(field({ ...online, seenAt: 'mail' })).toBe('seen_at');
    expect(field({ ...online, priceMinor: 0 })).toBe('price');
    expect(field({ ...online, priceMinor: '79.99' })).toBe('price');
    expect(field({ ...online, shippingMinor: -1 })).toBe('shipping');
    expect(field({ ...online, url: 'example.com/kettle' })).toBe('url');
    expect(field({ ...online, url: 'javascript:alert(1)' })).toBe('url');
    expect(field({ ...online, url: 'https://localhost/x' })).toBe('url');
    expect(field({ ...online, url: `https://example.com/${'a'.repeat(500)}` })).toBe('url');
    expect(field({ ...shop, store: ' ' })).toBe('store');
    expect(field({ ...shop, city: 'x'.repeat(61) })).toBe('city');
    expect(field({ ...shop, seenOn: '' })).toBe('seen_on');
    expect(field({ ...shop, seenOn: '2026-09-07' })).toBe('seen_on');
    expect(field({ ...shop, seenOn: '2026-10-10' })).toBe('seen_on');
    // a day ahead of UTC is still today somewhere
    expect(field({ ...shop, seenOn: '2026-10-09' })).toBe('ok');
    expect(field({ ...shop, seenOn: '2026-09-08' })).toBe('ok');
  });

  it('refuses a price that isn’t lower, delivery included', () => {
    expect(checkLowerPrice({ ...online, priceMinor: 9500, shippingMinor: 499 }, { ourPriceMinor: 9999, today })).toEqual({
      field: 'price',
      message: 'That isn’t lower than our price, with delivery.',
    });
    expect(checkLowerPrice({ ...shop, priceMinor: 9999 }, { ourPriceMinor: 9999, today })).toEqual({ field: 'price', message: 'That isn’t lower than our price.' });
    expect('input' in checkLowerPrice({ ...online, priceMinor: 9500, shippingMinor: 498 }, { ourPriceMinor: 9999, today })).toBe(true);
  });
});

describe('priceMinorOf / reportTotal / siteOf', () => {
  it('reads a typed price into minor units', () => {
    expect(priceMinorOf('79.99')).toBe(7999);
    expect(priceMinorOf(' $1,299.5 ')).toBe(129950);
    expect(priceMinorOf('₹1,299')).toBe(129900);
    expect(priceMinorOf('')).toBeNull();
    expect(priceMinorOf('12.345')).toBeNull();
    expect(priceMinorOf('free')).toBeNull();
  });

  it('adds delivery to the price', () => {
    expect(reportTotal({ priceMinor: 7999, shippingMinor: 499 })).toBe(8498);
  });

  it('names the site a price was seen on', () => {
    expect(siteOf('https://www.example.com/kettle?id=1')).toBe('example.com');
    expect(siteOf('http://shop.example.in')).toBe('shop.example.in');
    expect(siteOf('not a url')).toBe('not a url');
  });
});

import { describe, expect, it } from 'vitest';
import { budgetRange } from './decision/attributes';
import { compareSizes, parseQuery, pricePresets, toggleAttr, writeAttrs } from './search';

describe('parseQuery price range', () => {
  it('reads min and max as whole minor units', () => {
    expect(parseQuery({ min: '2500', max: '10000' })).toMatchObject({ minPrice: 2500, maxPrice: 10000 });
    expect(parseQuery({ min: ['500', '900'] }).minPrice).toBe(500);
  });

  it('drops anything that is not a positive whole number', () => {
    for (const v of ['0', '-5', '12.5', 'abc', '', '1e30']) {
      const q = parseQuery({ min: v, max: v });
      expect(q.minPrice).toBeUndefined();
      expect(q.maxPrice).toBeUndefined();
    }
    expect(parseQuery({}).minPrice).toBeUndefined();
  });
});

describe('parseQuery Pay On Delivery', () => {
  it('is on only with cod=1', () => {
    expect(parseQuery({}).cod).toBeUndefined();
    expect(parseQuery({ cod: '0' }).cod).toBeUndefined();
    expect(parseQuery({ cod: '1' }).cod).toBe(true);
  });
});

describe('parseQuery availability', () => {
  it('leaves out-of-stock products out unless oos=1', () => {
    expect(parseQuery({}).includeOutOfStock).toBeUndefined();
    expect(parseQuery({ oos: '0' }).includeOutOfStock).toBeUndefined();
    expect(parseQuery({ oos: '1' }).includeOutOfStock).toBe(true);
    expect(parseQuery({ oos: ['1', '0'] }).includeOutOfStock).toBe(true);
  });
});

describe('pricePresets', () => {
  it('buckets a department range at round prices the budget slider can reach', () => {
    expect(pricePresets(budgetRange('US', null))).toEqual([
      { label: 'Under $50', min: null, max: 5000 },
      { label: '$50 to $100', min: 5000, max: 10000 },
      { label: '$100 to $200', min: 10000, max: 20000 },
      { label: '$200 to $500', min: 20000, max: 50000 },
      { label: '$500 & above', min: 50000, max: null },
    ]);
    expect(pricePresets(budgetRange('US', 'books')).map((p) => p.label)).toEqual(['Under $10', '$10 to $25', '$25 & above']);
  });

  it('keeps at most four boundaries, spread across the range', () => {
    expect(pricePresets(budgetRange('IN', null)).map((p) => p.label)).toEqual([
      'Under ₹1,000',
      '₹1,000 to ₹2,000',
      '₹2,000 to ₹10,000',
      '₹10,000 to ₹20,000',
      '₹20,000 & above',
    ]);
    expect(pricePresets(budgetRange('IN', null), 2).map((p) => p.max)).toEqual([100_000, 2_000_000, null]);
  });

  it('is empty when no round price fits inside the range', () => {
    expect(pricePresets({ currency: 'USD', minMinor: 1000, maxMinor: 2000, stepMinor: 100, defaultMinor: 1500 })).toEqual([]);
  });
});

describe('parseQuery condition', () => {
  it('reads new, renewed or used, and ignores anything else', () => {
    expect(parseQuery({ condition: 'renewed' }).condition).toBe('renewed');
    expect(parseQuery({ condition: ['used', 'new'] }).condition).toBe('used');
    expect(parseQuery({ condition: 'refurbished' }).condition).toBeUndefined();
    expect(parseQuery({}).condition).toBeUndefined();
  });
});

describe('parseQuery sort', () => {
  it('reads Best Sellers, and falls back to Featured for anything unknown', () => {
    expect(parseQuery({ sort: 'bestsellers' }).sort).toBe('bestsellers');
    expect(parseQuery({ sort: 'popularity' }).sort).toBe('featured');
  });
});

describe('parseQuery discount', () => {
  it('reads a percentage off, ignoring anything outside 1–99', () => {
    expect(parseQuery({ pct: '25' }).minDiscount).toBe(25);
    for (const v of ['0', '100', '12.5', 'abc', undefined]) expect(parseQuery({ pct: v }).minDiscount).toBeUndefined();
  });
});

describe('parseQuery seller', () => {
  it('reads |-separated sellers, keeping commas inside a name', () => {
    expect(parseQuery({ seller: 'Amazon.com|Acme, Inc.' }).seller).toEqual(['Amazon.com', 'Acme, Inc.']);
    expect(parseQuery({ seller: ' Amazon.com || Amazon.com ' }).seller).toEqual(['Amazon.com']);
    expect(parseQuery({ seller: '|' }).seller).toBeUndefined();
    expect(parseQuery({}).seller).toBeUndefined();
  });
});

describe('parseQuery size', () => {
  it('reads comma-separated sizes, trimmed and once each', () => {
    expect(parseQuery({ size: 'M, L,UK 8,M' }).size).toEqual(['M', 'L', 'UK 8']);
    expect(parseQuery({ size: ' , ' }).size).toBeUndefined();
    expect(parseQuery({ size: 'X'.repeat(13) }).size).toBeUndefined();
    expect(parseQuery({}).size).toBeUndefined();
  });

  it('keeps twenty at most', () => {
    expect(parseQuery({ size: Array.from({ length: 25 }, (_, i) => String(i)).join(',') }).size).toHaveLength(20);
  });
});

describe('compareSizes', () => {
  const sorted = (xs: string[]) => [...xs].sort(compareSizes);

  it('puts letter sizes small to large', () => {
    expect(sorted(['XL', 'S', 'XXL', 'M', 'xs', 'L'])).toEqual(['xs', 'S', 'M', 'L', 'XL', 'XXL']);
  });

  it('puts numbered sizes by number, grouped by prefix', () => {
    expect(sorted(['UK 10', 'UK 7', 'UK 6', '12', '9.5', '10', 'UK 8'])).toEqual(['9.5', '10', '12', 'UK 6', 'UK 7', 'UK 8', 'UK 10']);
  });

  it('lists letters, then numbers, then the rest', () => {
    expect(sorted(['One Size', '8', 'M', 'Free'])).toEqual(['M', '8', 'Free', 'One Size']);
  });
});

describe('parseQuery attr', () => {
  it('reads a department filter’s values per label', () => {
    expect(parseQuery({ attr: 'Storage:128 GB|256 GB;RAM:8 GB' }).attrs).toEqual({ Storage: ['128 GB', '256 GB'], RAM: ['8 GB'] });
    // commas belong to the value
    expect(parseQuery({ attr: 'Use:Home gym, toning' }).attrs).toEqual({ Use: ['Home gym, toning'] });
  });

  it('trims, drops repeats and ignores what it can’t read', () => {
    expect(parseQuery({ attr: ' Storage : 128 GB || 128 GB ;Storage:64 GB' }).attrs).toEqual({ Storage: ['128 GB', '64 GB'] });
    for (const v of ['', ';', 'Storage', ':128 GB', 'Storage:', `Storage:${'x'.repeat(41)}`, `${'L'.repeat(41)}:x`, undefined]) {
      expect(parseQuery({ attr: v }).attrs).toBeUndefined();
    }
  });

  it('keeps six labels and ten values each at most', () => {
    const many = parseQuery({ attr: Array.from({ length: 8 }, (_, i) => `L${i}:${Array.from({ length: 12 }, (_, j) => `v${j}`).join('|')}`).join(';') }).attrs!;
    expect(Object.keys(many)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']);
    expect(many.L0).toHaveLength(10);
  });
});

describe('writeAttrs and toggleAttr', () => {
  it('round-trips through parseQuery', () => {
    const attrs = { Storage: ['128 GB', '256 GB'], 'Skin type': ['All skin types, including oily'] };
    expect(parseQuery({ attr: writeAttrs(attrs)! }).attrs).toEqual(attrs);
    expect(writeAttrs({})).toBeNull();
    expect(writeAttrs({ Storage: [] })).toBeNull();
  });

  it('adds a value, and takes it out (with its label, when it was the last) when it’s there', () => {
    const one = toggleAttr({}, 'Storage', '128 GB');
    expect(one).toEqual({ Storage: ['128 GB'] });
    const two = toggleAttr(toggleAttr(one, 'Storage', '256 GB'), 'RAM', '8 GB');
    expect(two).toEqual({ Storage: ['128 GB', '256 GB'], RAM: ['8 GB'] });
    expect(toggleAttr(two, 'Storage', '128 GB')).toEqual({ Storage: ['256 GB'], RAM: ['8 GB'] });
    expect(toggleAttr(two, 'RAM', '8 GB')).toEqual({ Storage: ['128 GB', '256 GB'] });
  });
});

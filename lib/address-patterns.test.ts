import { describe, expect, it } from 'vitest';
import { addressChecks } from './address-patterns';
import { parseAddress } from './data/addresses';
import type { Market } from './types';

/** How a browser applies a pattern attribute: anchored, compiled with the `v` flag. */
const browserAccepts = (pattern: string, value: string) => new RegExp(`^(?:${pattern})$`, 'v').test(value);

const serverAccepts = (market: Market, field: string, value: string) => {
  const base =
    market === 'US'
      ? { fullName: 'Alex Morgan', phone: '2065550123', line1: '410 Terry Ave N', city: 'Seattle', state: 'WA', postcode: '98109' }
      : { fullName: 'Priya Sharma', phone: '9876543210', line1: '12, Prestige Residency', line2: 'Koramangala', city: 'Bengaluru', state: 'Karnataka', postcode: '560034' };
  try {
    parseAddress(market, { ...base, [field]: value });
    return true;
  } catch {
    return false;
  }
};

const samples: Record<Market, Record<string, string[]>> = {
  US: {
    fullName: ['Alex', '  Alex Morgan ', '', '   '],
    phone: ['2065550123', '(206) 555-0123', '+1 206 555 0123', '1-206-555-0123', '206.555.0123', '1206555012', '206555012', '20655501234', '+44 20 7946 0958', '22065550123'],
    line1: ['410 Terry Ave N', ' ', ''],
    city: ['Seattle', '  ', ''],
    state: ['WA', 'wa', ' ny ', 'W', 'WAS', ''],
    postcode: ['98109', '98109-1234', ' 98109 ', '9810', '98109-12', '981091', 'ABCDE'],
  },
  IN: {
    fullName: ['Priya', ' ', ''],
    phone: ['9876543210', '+91 98765 43210', '91-9876543210', '098765 43210', '5876543210', '987654321', '919876543210', '9123456789', '+91 58765 43210'],
    line1: ['12, Prestige Residency', ' '],
    line2: ['Koramangala 4th Block', '  ', ''],
    city: ['Bengaluru', ' '],
    state: ['Karnataka', ' '],
    postcode: ['560034', ' 560034 ', '060034', '56003', '5600345', '56 0034'],
  },
};

describe('address form patterns', () => {
  for (const market of ['US', 'IN'] as const) {
    const checks = addressChecks(market === 'IN');
    for (const [field, values] of Object.entries(samples[market])) {
      it(`${market} ${field}: the browser accepts exactly what the server does`, () => {
        const check = checks[field as keyof typeof checks]!;
        expect(check.title).toBeTruthy();
        for (const value of values) {
          // an empty value is `required`'s job, not the pattern's (patterns don't apply to empty fields)
          if (value === '') continue;
          expect([value, browserAccepts(check.pattern, value)]).toEqual([value, serverAccepts(market, field, value)]);
        }
      });
    }
  }

  it('US line 2 stays free-form', () => {
    expect(addressChecks(false).line2).toBeUndefined();
  });
});

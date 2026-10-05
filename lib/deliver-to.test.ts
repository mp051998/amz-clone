import { describe, expect, it } from 'vitest';
import { cleanCity, deliverLabel, normalizePostcode, parseDeliverTo, serializeDeliverTo } from './deliver-to';

describe('normalizePostcode', () => {
  it('takes 5-digit ZIPs and ZIP+4 in the US', () => {
    expect(normalizePostcode('US', ' 94103 ')).toBe('94103');
    expect(normalizePostcode('US', '94103-1234')).toBe('94103');
    expect(normalizePostcode('US', '9410')).toBeNull();
    expect(normalizePostcode('US', '941031')).toBeNull();
    expect(normalizePostcode('US', 'abcde')).toBeNull();
  });

  it('takes 6-digit Pincodes that do not start with 0 in India', () => {
    expect(normalizePostcode('IN', '560 001')).toBe('560001');
    expect(normalizePostcode('IN', '060001')).toBeNull();
    expect(normalizePostcode('IN', '94103')).toBeNull();
  });
});

describe('cleanCity', () => {
  it('keeps real place names and drops anything else', () => {
    expect(cleanCity('  San   Francisco ')).toBe('San Francisco');
    expect(cleanCity("Coeur d'Alene")).toBe("Coeur d'Alene");
    expect(cleanCity('São Paulo')).toBe('São Paulo');
    expect(cleanCity('<b>x</b>')).toBeUndefined();
    expect(cleanCity('')).toBeUndefined();
    expect(cleanCity('x'.repeat(41))).toBeUndefined();
  });
});

describe('the cookie', () => {
  it('round-trips a postcode and city', () => {
    const d = { postcode: '560034', city: 'Bengaluru' };
    expect(parseDeliverTo('IN', serializeDeliverTo(d))).toEqual(d);
    expect(parseDeliverTo('IN', encodeURIComponent(serializeDeliverTo(d)))).toEqual(d);
    expect(parseDeliverTo('US', '94103')).toEqual({ postcode: '94103' });
  });

  it('ignores values for the other store and junk', () => {
    expect(parseDeliverTo('US', '560034|Bengaluru')).toBeNull();
    expect(parseDeliverTo('IN', 'nope')).toBeNull();
    expect(parseDeliverTo('US', '94103|<script>')).toEqual({ postcode: '94103' });
    expect(parseDeliverTo('US', undefined)).toBeNull();
  });

  it('labels a place by city and postcode', () => {
    expect(deliverLabel({ postcode: '560001', city: 'Bengaluru' })).toBe('Bengaluru 560001');
    expect(deliverLabel({ postcode: '94103' })).toBe('94103');
  });
});

import { describe, expect, it } from 'vitest';
import { dealProblemOf, dealProblemText, dealView, parseDealForm } from './admin-lightning-deals';
import { DataError } from './errors';

const product = { id: 'lamp', priceMinor: 5000, stock: 40 };
const now = new Date('2026-10-08T10:00:00.000Z');
const form = (over: Partial<Record<'price' | 'quota' | 'starts' | 'hours', string>> = {}) => ({ price: '35', quota: '10', starts: '', hours: '6', ...over });
const parse = (over: Parameters<typeof form>[0] = {}, timeZone = 'America/Los_Angeles') => parseDealForm(form(over), product, { timeZone, now });

describe('the deal form', () => {
  it('schedules from now, or from a start in the store’s time', () => {
    expect(parse()).toEqual({ input: { productId: 'lamp', dealPriceMinor: 3500, quota: 10, startsAt: null, hours: 6 } });
    expect(parse({ price: '34.99', starts: '2026-10-08T09:30', hours: '12' })?.input).toEqual({
      productId: 'lamp',
      dealPriceMinor: 3499,
      quota: 10,
      startsAt: '2026-10-08T16:30:00.000Z',
      hours: 12,
    });
    expect(parse({ starts: '2026-10-08T16:00' }, 'Asia/Kolkata').input?.startsAt).toBe('2026-10-08T10:30:00.000Z');
    // the minute the admin opened the form counts as now
    expect(parse({ starts: '2026-10-08T02:57' }).input?.startsAt).toBe('2026-10-08T09:57:00.000Z');
  });

  it('wants a price below the product’s, units it has, a start to come and 1 to 12 hours', () => {
    for (const price of ['50', '60', '0', '', 'abc', '1.999']) expect(parse({ price }).problem).toBe('price');
    for (const quota of ['0', '41', '2.5', '', '-1']) expect(parse({ quota }).problem).toBe('quota');
    for (const starts of ['2026-10-08T02:00', '2026-10-08', 'tomorrow']) expect(parse({ starts }).problem).toBe('starts');
    for (const hours of ['0', '13', '', '1.5']) expect(parse({ hours }).problem).toBe('hours');
  });
});

describe('deal problems', () => {
  it('name what the database refused, and say it', () => {
    expect(dealProblemOf(new DataError('invalid_input', 'deal_price_minor'))).toBe('price');
    expect(dealProblemOf(new DataError('invalid_input', 'overlap'))).toBe('overlap');
    expect(dealProblemOf(new DataError('invalid_input', 'product_id'))).toBe('product');
    expect(dealProblemOf(new DataError('invalid_input', 'something_else'))).toBeNull();
    expect(dealProblemOf(new DataError('forbidden'))).toBeNull();
    expect(dealProblemText('quota', { stock: 7 })).toMatch(/1 to 7/);
    expect(dealProblemText('overlap')).toMatch(/another deal/);
    expect(dealProblemText('nope')).toBeNull();
    expect(dealProblemText(undefined)).toBeNull();
  });

  it('views default to live', () => {
    expect(dealView('ended')).toBe('ended');
    expect(dealView('upcoming')).toBe('upcoming');
    expect(dealView('soon')).toBe('live');
    expect(dealView(undefined)).toBe('live');
  });
});

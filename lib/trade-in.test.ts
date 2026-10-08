import { describe, expect, it } from 'vitest';
import { hasTradeIn, tradeInCredit, tradeInValue } from './trade-in';

describe('tradeInValue', () => {
  it('is the full value with an undamaged screen, half (rounded down) with a damaged one', () => {
    expect(tradeInValue(25000, 'good')).toBe(25000);
    expect(tradeInValue(25000, 'screen_damaged')).toBe(12500);
    expect(tradeInValue(10501, 'screen_damaged')).toBe(5250);
  });
});

describe('tradeInCredit', () => {
  it('pays the quote when the device arrives as described', () => {
    expect(tradeInCredit(25000, 25000, 'good')).toBe(25000);
    expect(tradeInCredit(28000, 14000, 'screen_damaged')).toBe(14000);
  });

  it('pays what it is worth as it came when that is less', () => {
    expect(tradeInCredit(25000, 25000, 'screen_damaged')).toBe(12500);
  });

  it('never pays more than the quote', () => {
    expect(tradeInCredit(28000, 14000, 'good')).toBe(14000);
  });
});

it('is amazon.com only', () => {
  expect(hasTradeIn('US')).toBe(true);
  expect(hasTradeIn('IN')).toBe(false);
});

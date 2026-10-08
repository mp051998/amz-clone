import { describe, expect, it } from 'vitest';
import { memberDealLabel, memberPrice, memberUnitOff } from './member-deals';

describe('Plus exclusive deals', () => {
  it('take a percent off, rounded down to the minor unit', () => {
    expect(memberUnitOff(15, 1295)).toBe(194);
    expect(memberUnitOff(undefined, 1295)).toBe(0);
    expect(memberPrice({ priceMinor: 1295, memberPct: 15 })).toBe(1101);
    expect(memberPrice({ priceMinor: 1295 })).toBeNull();
  });

  it('are named for the membership', () => {
    expect(memberDealLabel('Plus')).toBe('Plus exclusive deal');
  });
});

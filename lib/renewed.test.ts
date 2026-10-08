import { expect, it } from 'vitest';
import { amazon } from './amazon';
import { amazonIn } from './marketplace-in';
import { guaranteeDays, guaranteeLabel, guaranteeText, savingOnNew } from './renewed';

it('gives the US store the 90-day Renewed Guarantee and India none', () => {
  expect(guaranteeDays(amazon)).toBe(90);
  expect(guaranteeLabel(amazon)).toBe('90-day Renewed Guarantee');
  expect(guaranteeDays(amazonIn)).toBeNull();
  expect(guaranteeLabel(amazonIn)).toBeNull();
  expect(guaranteeText(90)).toBe('If it doesn’t work as it should, return it within 90 days of delivery for a refund or a replacement.');
});

it('says how much less than new a renewed offer costs', () => {
  expect(savingOnNew(24_900, 39_900)).toEqual({ savedMinor: 15_000, pct: 38 });
  // not cheaper: no saving to show
  expect(savingOnNew(39_900, 39_900)).toBeNull();
  expect(savingOnNew(41_000, 39_900)).toBeNull();
  expect(savingOnNew(0, 0)).toBeNull();
});

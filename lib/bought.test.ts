import { expect, it } from 'vitest';
import { boughtLabel } from './bought';

it('shows nothing under 50 units', () => {
  expect(boughtLabel(0)).toBeNull();
  expect(boughtLabel(49)).toBeNull();
  expect(boughtLabel(Number.NaN)).toBeNull();
});

it('rounds down to Amazon’s steps', () => {
  expect(boughtLabel(50)).toBe('50+ bought in past month');
  expect(boughtLabel(99)).toBe('50+ bought in past month');
  expect(boughtLabel(100)).toBe('100+ bought in past month');
  expect(boughtLabel(287)).toBe('200+ bought in past month');
  expect(boughtLabel(999)).toBe('900+ bought in past month');
  expect(boughtLabel(1000)).toBe('1K+ bought in past month');
  expect(boughtLabel(2450)).toBe('2K+ bought in past month');
  expect(boughtLabel(12_000)).toBe('10K+ bought in past month');
  expect(boughtLabel(1_500_000)).toBe('1M+ bought in past month');
});

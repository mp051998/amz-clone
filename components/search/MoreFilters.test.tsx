import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PricePreset } from '@/lib/search';
import { MoreFilters, type MoreFiltersProps } from './MoreFilters';

afterEach(cleanup);

const presets: PricePreset[] = [
  { label: 'Under $50', min: null, max: 5000 },
  { label: '$50 to $100', min: 5000, max: 10000 },
  { label: '$100 & above', min: 10000, max: null },
];

const hrefWith = (patch: Record<string, string | null>) => `/s#${JSON.stringify(patch)}`;

const renderFilters = (over: Partial<MoreFiltersProps> = {}) =>
  render(<MoreFilters categories={[]} dept={null} brandFacets={[]} brands={[]} deal={false} hrefWith={hrefWith} {...over} />);

const priceList = () => within(screen.getByRole('heading', { name: 'Price' }).parentElement!);

describe('MoreFilters price', () => {
  it('lists the buckets, each setting the lowest price and the budget', () => {
    renderFilters({ pricePresets: presets });
    const p = priceList();
    expect(p.getByRole('checkbox', { name: 'Under $50' }).getAttribute('href')).toBe(hrefWith({ min: null, budget: '5000' }));
    expect(p.getByRole('checkbox', { name: '$50 to $100' }).getAttribute('href')).toBe(hrefWith({ min: '5000', budget: '10000' }));
    // open-ended: no ceiling, even one read from the words typed
    expect(p.getByRole('checkbox', { name: '$100 & above' }).getAttribute('href')).toBe(hrefWith({ min: '10000', budget: '0' }));
    expect(p.getAllByRole('checkbox').every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('checks the bucket matching the current range, and clicking it again clears the range', () => {
    renderFilters({ pricePresets: presets, minPrice: 5000, maxPrice: 10000 });
    const on = priceList().getByRole('checkbox', { name: '$50 to $100' });
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(on.getAttribute('href')).toBe(hrefWith({ min: null, budget: '0' }));
    expect(priceList().getByRole('checkbox', { name: 'Under $50' }).getAttribute('aria-checked')).toBe('false');
  });

  it('a budget read from the search words checks its "Under" bucket', () => {
    renderFilters({ pricePresets: presets, maxPrice: 5000 });
    expect(priceList().getByRole('checkbox', { name: 'Under $50' }).getAttribute('aria-checked')).toBe('true');
  });

  it('has no Price section without buckets', () => {
    renderFilters();
    expect(screen.queryByRole('heading', { name: 'Price' })).toBeNull();
  });
});

describe('MoreFilters availability', () => {
  it('leaves out-of-stock products out until ticked, and unticking takes them out again', () => {
    renderFilters();
    const box = screen.getByRole('checkbox', { name: 'Include Out of Stock' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(box.getAttribute('href')).toBe(hrefWith({ oos: '1' }));
    cleanup();
    renderFilters({ includeOutOfStock: true });
    const on = screen.getByRole('checkbox', { name: 'Include Out of Stock' });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(on.getAttribute('href')).toBe(hrefWith({ oos: null }));
  });
});

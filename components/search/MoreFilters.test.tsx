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

describe('MoreFilters discount', () => {
  const discount = () => within(screen.getByRole('heading', { name: 'Discount' }).parentElement!);
  it('offers percentages off, each narrowing to at least that much', () => {
    renderFilters();
    const boxes = discount().getAllByRole('checkbox');
    expect(boxes.map((b) => b.textContent)).toEqual(['10% off or more', '25% off or more', '50% off or more', '70% off or more']);
    expect(boxes.every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(boxes[1].getAttribute('href')).toBe(hrefWith({ pct: '25' }));
  });

  it('checks the one picked, which clears it when clicked again', () => {
    renderFilters({ minDiscount: 50 });
    const on = discount().getByRole('checkbox', { name: '50% off or more' });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(on.getAttribute('href')).toBe(hrefWith({ pct: null }));
    expect(discount().getByRole('checkbox', { name: '10% off or more' }).getAttribute('href')).toBe(hrefWith({ pct: '10' }));
  });
});

describe('MoreFilters seller', () => {
  const sellerList = () => within(screen.getByRole('heading', { name: 'Seller' }).parentElement!);
  const facets = Array.from({ length: 12 }, (_, i) => ({ name: i === 1 ? 'Acme, Inc.' : `Seller ${i}`, count: 20 - i }));

  it('lists the top ten sellers with counts, each adding itself to the ones picked', () => {
    renderFilters({ sellerFacets: facets, sellers: ['Seller 0'] });
    const boxes = sellerList().getAllByRole('checkbox');
    expect(boxes).toHaveLength(10);
    expect(boxes[0]).toHaveAttribute('aria-checked', 'true');
    expect(boxes[0].getAttribute('href')).toBe(hrefWith({ seller: null }));
    expect(boxes[1]).toHaveTextContent('Acme, Inc.19');
    expect(boxes[1].getAttribute('href')).toBe(hrefWith({ seller: 'Seller 0|Acme, Inc.' }));
  });

  it('keeps a picked seller listed past the top ten', () => {
    renderFilters({ sellerFacets: facets, sellers: ['Seller 11'] });
    const picked = sellerList().getByRole('checkbox', { name: /Seller 11/ });
    expect(picked).toHaveAttribute('aria-checked', 'true');
    expect(sellerList().queryByRole('checkbox', { name: /Seller 10/ })).toBeNull();
  });

  it('has no Seller section without sellers', () => {
    renderFilters();
    expect(screen.queryByRole('heading', { name: 'Seller' })).toBeNull();
  });
});

describe('MoreFilters size', () => {
  const sizeList = () => within(screen.getByRole('heading', { name: 'Size' }).parentElement!);
  const facets = [
    { name: 'S', count: 2 },
    { name: 'M', count: 3 },
    { name: 'L', count: 1 },
  ];

  it('lists the sizes in the order given, each adding itself to the ones picked', () => {
    renderFilters({ sizeFacets: facets, sizes: ['M'] });
    const boxes = sizeList().getAllByRole('checkbox');
    expect(boxes.map((b) => b.textContent)).toEqual(['S', 'M', 'L']);
    expect(boxes[0]).toHaveAccessibleName('S (2)');
    expect(boxes[0]).toHaveAttribute('aria-checked', 'false');
    expect(boxes[0].getAttribute('href')).toBe(hrefWith({ size: 'M,S' }));
    expect(boxes[1]).toHaveAttribute('aria-checked', 'true');
    expect(boxes[1].getAttribute('href')).toBe(hrefWith({ size: null }));
  });

  it('has no Size section without sizes', () => {
    renderFilters();
    expect(screen.queryByRole('heading', { name: 'Size' })).toBeNull();
  });

  it('drops the sizes picked on a department change', () => {
    renderFilters({ categories: [{ slug: 'shoes', name: 'Shoes' } as never], sizes: ['M'] });
    expect(screen.getByRole('link', { name: 'Shoes' }).getAttribute('href')).toContain('"size":null');
  });
});

describe('MoreFilters Climate Pledge Friendly', () => {
  const climateBox = () => within(screen.getByRole('heading', { name: 'Climate Pledge Friendly' }).parentElement!).getByRole('checkbox');

  it('offers the filter with how many in scope are certified', () => {
    renderFilters({ climateCount: 12 });
    const box = climateBox();
    expect(box).toHaveAccessibleName('Climate Pledge Friendly (12)');
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(box.getAttribute('href')).toBe(hrefWith({ climate: '1' }));
  });

  it('unticks when on, even with none left in scope', () => {
    renderFilters({ climate: true });
    const box = climateBox();
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(box.getAttribute('href')).toBe(hrefWith({ climate: null }));
  });

  it('has no section when nothing in scope is certified', () => {
    renderFilters();
    expect(screen.queryByRole('heading', { name: 'Climate Pledge Friendly' })).toBeNull();
  });
});

describe('MoreFilters Small Business', () => {
  const box = () => within(screen.getByRole('heading', { name: 'Small Business' }).parentElement!).getByRole('checkbox');

  it('offers the filter with how many in scope are from small businesses', () => {
    renderFilters({ smallBusinessCount: 3 });
    expect(box()).toHaveAccessibleName('Small Business (3)');
    expect(box()).toHaveAttribute('aria-checked', 'false');
    expect(box().getAttribute('href')).toBe(hrefWith({ small: '1' }));
  });

  it('unticks when on, and has no section when there are none', () => {
    renderFilters({ smallBusiness: true });
    expect(box()).toHaveAttribute('aria-checked', 'true');
    expect(box().getAttribute('href')).toBe(hrefWith({ small: null }));
    cleanup();
    renderFilters();
    expect(screen.queryByRole('heading', { name: 'Small Business' })).toBeNull();
  });
});

describe('MoreFilters Pay On Delivery', () => {
  const box = () => within(screen.getByRole('heading', { name: 'Pay On Delivery' }).parentElement!).getByRole('checkbox');

  it('offers it in a store that takes it, and unticks when on', () => {
    renderFilters({ cod: false });
    expect(box()).toHaveAccessibleName('Eligible for Pay On Delivery');
    expect(box()).toHaveAttribute('aria-checked', 'false');
    expect(box().getAttribute('href')).toBe(hrefWith({ cod: '1' }));
    cleanup();
    renderFilters({ cod: true });
    expect(box()).toHaveAttribute('aria-checked', 'true');
    expect(box().getAttribute('href')).toBe(hrefWith({ cod: null }));
  });

  it('has no section in a store that doesn’t', () => {
    renderFilters();
    expect(screen.queryByRole('heading', { name: 'Pay On Delivery' })).toBeNull();
  });
});

describe('MoreFilters Condition', () => {
  const list = () => within(screen.getByRole('heading', { name: 'Condition' }).parentElement!);

  it('lists the conditions found, with counts, each picking just that one', () => {
    renderFilters({ conditionCounts: { new: 12, renewed: 0, used: 3 } });
    expect(list().getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['New (12)', 'Used (3)']);
    expect(list().getByRole('checkbox', { name: 'Used (3)' }).getAttribute('href')).toBe(hrefWith({ condition: 'used' }));
    expect(list().getAllByRole('checkbox').every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('unpicks the one picked, even with none left in scope', () => {
    renderFilters({ condition: 'renewed', conditionCounts: { new: 4, renewed: 0, used: 0 } });
    const on = list().getByRole('checkbox', { name: 'Renewed' });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(on.getAttribute('href')).toBe(hrefWith({ condition: null }));
  });

  it('has no section when everything is only sold new', () => {
    renderFilters({ conditionCounts: { new: 9, renewed: 0, used: 0 } });
    expect(screen.queryByRole('heading', { name: 'Condition' })).toBeNull();
  });
});

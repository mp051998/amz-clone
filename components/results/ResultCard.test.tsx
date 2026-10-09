import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import type { Product } from '@/lib/types';

vi.mock('../decision/Compare', () => ({ CompareToggle: () => null }));
vi.mock('../decision/SaveButton', () => ({ SaveButton: () => null }));
vi.mock('@/app/actions/cart', () => ({ addToCart: async () => {} }));

import { ResultCard } from './ResultCard';

const base: Product = {
  id: 'p1',
  market: 'US',
  title: 'Sony WH-1000XM5 Wireless Headphones',
  category: 'headphones',
  categoryName: 'Headphones',
  image: '',
  priceMinor: 29999,
  listMinor: 39999,
  rating: 4.6,
  reviewCount: 1200,
  seller: 'Store',
  shipsFrom: 'Store',
  bullets: [],
  stock: 5,
  curBase: 'USD',
};

function show(over: Partial<Product> = {}, props: { bestSeller?: boolean } = {}) {
  render(<ResultCard ranked={{ product: { ...base, ...over }, insight: null, match: 90, why: [], warn: null }} store={amazon} saved={false} {...props} />);
  return screen.getByRole('article');
}

afterEach(cleanup);

it('shows the badge, past-month sales and the deal label like an Amazon result', () => {
  const card = show({ badge: 'Best Seller', boughtPastMonth: '10K+ bought in past month', deal: true });
  expect(card).toHaveTextContent('Best Seller');
  expect(card).toHaveTextContent('10K+ bought in past month');
  expect(card).toHaveTextContent('Limited-time deal');
});

it('leaves them out when the product has none', () => {
  const card = show();
  expect(card).not.toHaveTextContent(/Best Seller|bought in past month|Limited-time deal/);
});

it('puts the unit price beside the price when the product says how much it holds', () => {
  const card = show({ priceMinor: 5899, listMinor: undefined, unit: { qty: 3, kind: 'fl_oz' } });
  expect(screen.getByRole('text', { name: '$58.99 ($19.66 / Fl Oz)' })).toBeInTheDocument();
  expect(card).toHaveTextContent('$58.99($19.66 / Fl Oz)');
  cleanup();
  expect(show({ listMinor: undefined })).not.toHaveTextContent(/ \/ /);
});

it('a deal badge is not repeated as a second deal label', () => {
  const card = show({ badge: 'Limited time deal', deal: true });
  expect(card).toHaveTextContent('Limited time deal');
  expect(card).not.toHaveTextContent('Limited-time deal');
});

it('adds to the cart straight from the result, while in stock', () => {
  show();
  expect(screen.getByRole('button', { name: 'Add Sony WH-1000XM5 Wireless Headphones to cart' })).toBeInTheDocument();
  cleanup();
  show({ stock: 0 });
  expect(screen.queryByRole('button', { name: /to cart/ })).toBeNull();
});

it('promises the store’s delivery day: free over the threshold, and always for Plus members', () => {
  const card = (over: Partial<Product>, delivery?: { day: string; member?: boolean }) => {
    render(<ResultCard ranked={{ product: { ...base, ...over }, insight: null, match: 90, why: [], warn: null }} store={amazon} saved={false} delivery={delivery} />);
    const el = screen.getByRole('article');
    return el.textContent;
  };
  expect(card({ priceMinor: 1999 }, { day: 'Thursday, October 8' })).toContain('Delivery Thursday, October 8 · FREE over $35.00');
  cleanup();
  expect(card({ priceMinor: 1999 }, { day: 'Thursday, October 8', member: true })).toContain('FREE delivery Thursday, October 8');
  cleanup();
  expect(card({}, { day: 'Tomorrow, October 7' })).toContain('FREE delivery Tomorrow, October 7');
});

it('offers the fastest delivery day under the standard one, free for members, while it can ship', () => {
  const card = (over: Partial<Product>, delivery: { day: string; member?: boolean; fastest?: string }) => {
    render(<ResultCard ranked={{ product: { ...base, ...over }, insight: null, match: 90, why: [], warn: null }} store={amazon} saved={false} delivery={delivery} />);
    return screen.getByRole('article').textContent;
  };
  expect(card({}, { day: 'Thursday, October 8', fastest: 'Tomorrow, October 7' })).toContain('Or fastest delivery Tomorrow, October 7');
  cleanup();
  expect(card({}, { day: 'Thursday, October 8', fastest: 'Tomorrow, October 7', member: true })).toContain('Or FREE fastest delivery Tomorrow, October 7');
  cleanup();
  expect(card({}, { day: 'Thursday, October 8' })).not.toContain('fastest');
  cleanup();
  expect(card({}, { day: 'Tomorrow, October 7', fastest: 'Tomorrow, October 7' })).not.toContain('fastest');
  cleanup();
  expect(card({ stock: 0 }, { day: 'Thursday, October 8', fastest: 'Tomorrow, October 7' })).not.toContain('fastest');
  cleanup();
  expect(card({ releaseAt: '2099-11-20T08:00:00.000Z' }, { day: 'Thursday, October 8', fastest: 'Tomorrow, October 7' })).not.toContain('fastest');
});

it('says when a pre-order comes out in place of the delivery day', () => {
  // far off, so it stays a pre-order
  expect(show({ releaseAt: '2099-11-20T08:00:00.000Z' })).toHaveTextContent('Pre-order · releases November 20, 2099');
  cleanup();
  expect(show({ releaseAt: '2020-11-20T08:00:00.000Z' })).not.toHaveTextContent('Pre-order');
});

it('marks a Climate Pledge Friendly product', () => {
  expect(show({ climate: ['recycled'] })).toHaveTextContent('Climate Pledge Friendly');
  cleanup();
  expect(show()).not.toHaveTextContent('Climate Pledge Friendly');
});

it('marks a small business’s product', () => {
  expect(show({ smallBusiness: true })).toHaveTextContent('Small Business');
  cleanup();
  expect(show()).not.toHaveTextContent('Small Business');
});

it('shows other sellers’ offers as More Buying Choices, linking to them', () => {
  const choices = { count: 3, fromMinor: 18999, kinds: [{ kind: 'new' as const, count: 1, fromMinor: 27999 }, { kind: 'used' as const, count: 2, fromMinor: 18999 }] };
  render(<ResultCard ranked={{ product: base, insight: null, match: 90, why: [], warn: null }} store={amazon} saved={false} choices={choices} condition="used" />);
  expect(screen.getByRole('article')).toHaveTextContent('More Buying Choices$189.99 (3 used & new offers)');
  expect(screen.getByRole('link', { name: '$189.99 (3 used & new offers)' }).getAttribute('href')).toMatch(/\/product\/p1\/offers\?condition=used$/);
  cleanup();
  expect(show()).not.toHaveTextContent('More Buying Choices');
});

it("marks its department's #1 best seller, linking to that list", () => {
  const card = show({ badge: 'Best Seller' }, { bestSeller: true });
  expect(within(card).getByRole('link', { name: '#1 Best Seller in Headphones' })).toHaveAttribute('href', '/bestsellers?c=headphones');
  // not twice
  expect(within(card).getAllByText(/Best Seller/)).toHaveLength(1);
  cleanup();

  const other = show({ badge: 'Overall Pick' }, { bestSeller: true });
  expect(other).toHaveTextContent('Overall Pick');
  expect(within(other).getByRole('link', { name: '#1 Best Seller in Headphones' })).toBeInTheDocument();
  cleanup();

  expect(within(show()).queryByRole('link', { name: /#1 Best Seller/ })).toBeNull();
});

it('says when only a few are left, once, and not on a pre-order or with plenty left', () => {
  render(<ResultCard ranked={{ product: { ...base, stock: 3 }, insight: null, match: 90, why: ['Great noise cancelling'], warn: 'Only 3 left in stock' }} store={amazon} saved={false} />);
  const card = screen.getByRole('article');
  expect(within(card).getByText('Only 3 left in stock — order soon.')).toBeInTheDocument();
  // the ranking's warning isn't repeated under "Why it's here"
  expect(card).not.toHaveTextContent('Trade-off');
  expect(card).toHaveTextContent('Strength: Great noise cancelling');
  cleanup();

  expect(show({ stock: 10 })).toHaveTextContent('Only 10 left in stock — order soon.');
  cleanup();
  expect(show({ stock: 11 })).not.toHaveTextContent('left in stock');
  cleanup();
  expect(show({ stock: 0 })).not.toHaveTextContent('left in stock');
  cleanup();
  expect(show({ stock: 3, releaseAt: new Date(Date.now() + 7 * 86_400_000).toISOString() })).not.toHaveTextContent('left in stock');
});

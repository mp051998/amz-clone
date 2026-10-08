import { cleanup, render, screen } from '@testing-library/react';
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

function show(over: Partial<Product> = {}) {
  render(<ResultCard ranked={{ product: { ...base, ...over }, insight: null, match: 90, why: [], warn: null }} store={amazon} saved={false} />);
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

it('says when a pre-order comes out in place of the delivery day', () => {
  // far off, so it stays a pre-order
  expect(show({ releaseAt: '2099-11-20T08:00:00.000Z' })).toHaveTextContent('Pre-order · releases November 20, 2099');
  cleanup();
  expect(show({ releaseAt: '2020-11-20T08:00:00.000Z' })).not.toHaveTextContent('Pre-order');
});

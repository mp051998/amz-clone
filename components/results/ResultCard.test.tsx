import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import type { Product } from '@/lib/types';

vi.mock('../decision/Compare', () => ({ CompareToggle: () => null }));
vi.mock('../decision/SaveButton', () => ({ SaveButton: () => null }));

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

it('a deal badge is not repeated as a second deal label', () => {
  const card = show({ badge: 'Limited time deal', deal: true });
  expect(card).toHaveTextContent('Limited time deal');
  expect(card).not.toHaveTextContent('Limited-time deal');
});

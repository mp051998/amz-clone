import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { amazon } from '../../lib/amazon';
import type { Product } from '../../lib/catalog';
import { DealRail } from './DealRail';

const dealProduct: Product = {
  id: 'headphones',
  title: 'Wireless headphones with active noise cancellation',
  category: 'electronics',
  image: '/products/headphones.jpg',
  priceMinor: 4999,
  listMinor: 7999,
  dealPct: 38,
  rating: 4.6,
  reviewCount: 1200,
  seller: 'Amazon',
  shipsFrom: 'Amazon',
  bullets: [],
  deal: true,
};

it('renders deal media, savings badge, and labelled carousel controls', () => {
  render(<DealRail title="Today's deals" products={[dealProduct]} store={amazon} />);

  expect(screen.getByRole('img', { name: /wireless headphones/i })).toBeInTheDocument();
  expect(screen.getByText('-38%')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /scroll left/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /scroll right/i })).toBeEnabled();
});

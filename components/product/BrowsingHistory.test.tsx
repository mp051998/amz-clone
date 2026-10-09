import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { amazon } from '../../lib/amazon';
import { amazonIn } from '../../lib/marketplace-in';
import type { Product } from '../../lib/types';
import { BrowsingHistory } from './BrowsingHistory';

vi.mock('@/app/actions/cart', () => ({ addToCart: async () => {} }));

afterEach(cleanup);

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  market: 'US',
  title: 'Wireless headphones with active noise cancellation',
  category: 'electronics',
  categoryName: 'Electronics',
  stock: 40,
  curBase: 'USD',
  image: '/products/headphones.jpg',
  priceMinor: 4999,
  rating: 4.6,
  reviewCount: 1200,
  seller: 'Store',
  shipsFrom: 'Store',
  bullets: [],
  ...over,
});

it('renders nothing when nothing was viewed', () => {
  const { container } = render(<BrowsingHistory products={[]} store={amazon} />);
  expect(container).toBeEmptyDOMElement();
});

it('lists the viewed products under "Your browsing history", with See all to /history', () => {
  render(<BrowsingHistory products={[product(), product({ id: 'p2', title: 'Desk lamp' })]} store={amazon} />);
  const section = screen.getByRole('region', { name: 'Your browsing history' });
  expect(within(section).getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/history');
  expect(within(section).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(expect.arrayContaining(['/product/p1', '/product/p2']));
});

it('links within the India store', () => {
  render(<BrowsingHistory products={[product({ id: 'in-1', market: 'IN', curBase: 'INR' })]} store={amazonIn} />);
  expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/in/history');
});

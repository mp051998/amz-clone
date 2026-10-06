import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { amazon } from '../../lib/amazon';
import { amazonIn } from '../../lib/marketplace-in';
import { endsLabel, exampleQueries, greetingFor } from '../../lib/home-content';
import type { Product } from '../../lib/types';
import { ContinueRow, DealGrid, PickGrid, SavedDropGrid } from './HomeSections';

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
  listMinor: 7999,
  dealPct: 38,
  rating: 4.6,
  reviewCount: 1200,
  seller: 'Store',
  shipsFrom: 'Store',
  bullets: [],
  deal: true,
  ...over,
});

it('deal cards show the off tag, struck list price, rating and ends line, linking to the product', () => {
  render(<DealGrid deals={[{ product: product(), ends: 'Ends in 5h' }]} store={amazon} />);
  const link = screen.getByRole('link');
  expect(link).toHaveAttribute('href', '/product/p1');
  expect(within(link).getByText('38% OFF')).toBeInTheDocument();
  expect(within(link).getByText('$49.99')).toBeInTheDocument();
  expect(within(link).getByText('$79.99')).toBeInTheDocument();
  expect(within(link).getByText('Ends in 5h')).toBeInTheDocument();
});

it('pick cards carry their reason chip and best-for line; IN links are /in-prefixed with rupee prices', () => {
  const p = product({ id: 'in-x', market: 'IN', curBase: 'INR', priceMinor: 299900, listMinor: 499900 });
  render(<PickGrid picks={[{ product: p, reason: 'Because you viewed Sony WH-1000XM5', bestFor: 'Commuting & travel' }]} store={amazonIn} />);
  expect(screen.getByText('Because you viewed Sony WH-1000XM5')).toBeInTheDocument();
  expect(screen.getByText('Commuting & travel')).toBeInTheDocument();
  expect(screen.getByText('₹2,999')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Wireless headphones/ })).toHaveAttribute('href', '/in/product/in-x');
});

it('continue shopping renders one card per recently viewed product', () => {
  render(<ContinueRow products={[product(), product({ id: 'p2', title: 'Second product' })]} store={amazon} />);
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(screen.getAllByText('Viewed recently')).toHaveLength(2);
});

it('the continue row is a positioned scroller, so its screen-reader text can’t widen the page on a phone', () => {
  // `sr-only` text is absolutely positioned: without a positioned scroller it escapes the row's
  // overflow clip and stretches the page sideways once a few cards are in it
  render(<ContinueRow products={[product(), product({ id: 'p2' }), product({ id: 'p3' })]} store={amazon} />);
  expect(screen.getByRole('list')).toHaveClass('overflow-x-auto', 'relative');
});

it('greets by store-local hour and counts down to local midnight', () => {
  const at = new Date('2026-09-26T13:30:00Z'); // 06:30 Los Angeles, 19:00 Kolkata
  expect(greetingFor(at, 'America/Los_Angeles')).toBe('Good morning');
  expect(greetingFor(at, 'Asia/Kolkata')).toBe('Good evening');
  expect(endsLabel(at, 'Asia/Kolkata')).toBe('Ends in 5h');
  expect(endsLabel(new Date('2026-09-26T18:10:00Z'), 'Asia/Kolkata')).toBe('Ends in 20m');
});

it('example queries use the store currency', () => {
  expect(exampleQueries(amazon).join(' ')).toContain('$');
  expect(exampleQueries(amazonIn).join(' ')).toContain('₹');
});

it('shows what a saved product dropped by, with the price it was saved at struck through', () => {
  render(<SavedDropGrid drops={[{ product: product({ priceMinor: 3999 }), savedPriceMinor: 4999, dropMinor: 1000 }]} store={amazon} />);
  const card = screen.getByRole('link', { name: /since you saved/ });
  expect(card).toHaveAttribute('href', '/product/p1');
  expect(within(card).getByText('↓ $10.00 since you saved')).toBeInTheDocument();
  expect(card.querySelector('s')).toHaveTextContent('saved at $49.99');
  expect(within(card).getByText('$39.99')).toBeInTheDocument();
});

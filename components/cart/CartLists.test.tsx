import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { BuyAgainItem } from '@/lib/buy-again';
import type { CollectionItem } from '@/lib/decision/types';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { Product } from '@/lib/types';

vi.mock('@/components/decision', () => ({ ProductFrame: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/app/actions/collections', () => ({ moveCartItemToSaved: async () => ({}), moveSavedToCart: async () => ({ ok: true }), removeFromCollection: async () => ({ ok: true }) }));
vi.mock('@/app/cart/actions', () => ({ swapCartLine: async () => ({ ok: true }) }));
vi.mock('@/app/actions/cart', () => ({ addToCart: async () => {} }));

import { CartLists, cartList } from './CartLists';

const product = (id: string, over: Partial<Product> = {}): Product => ({
  id, market: 'US', title: `Product ${id}`, category: 'c', categoryName: 'C', image: '', priceMinor: 1999, rating: 4, reviewCount: 1,
  seller: 'S', shipsFrom: 'S', bullets: [], stock: 20, curBase: 'USD', ...over,
});

const saved = (id: string): CollectionItem => ({ product: product(id), savedPriceMinor: 1999, savedInStock: true, addedAt: '2026-10-01T00:00:00Z' });

const bought = (id: string, over: Partial<Product> = {}, orders = 1): BuyAgainItem & { product: Product } => ({
  productId: id, title: `Product ${id}`, image: '', lastBoughtAt: '2026-09-14T15:00:00Z', lastOrderId: `ORD-${id}`, orders,
  product: product(id, over), availability: 'available',
});

afterEach(cleanup);

const later = { collectionId: 'c1', items: [saved('s1'), saved('s2')] };

it('tabs between Saved for later and Buy it again, Saved for later first', () => {
  render(<CartLists later={later} again={[bought('b1')]} moreAgain={false} view="later" store={amazon} />);
  const tabs = screen.getByRole('navigation', { name: 'Saved for later and Buy it again' });
  expect(within(tabs).getByRole('link', { name: 'Saved for later (2 items)' })).toHaveAttribute('aria-current', 'page');
  expect(within(tabs).getByRole('link', { name: 'Buy it again' })).toHaveAttribute('href', '/cart?list=again#your-lists');
  // the tab names the list; its heading stays for screen readers
  expect(screen.getByRole('heading', { name: 'Saved for later (2 items)' })).toHaveClass('sr-only');
  expect(screen.getByRole('link', { name: 'Product s1' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Product b1' })).toBeNull();
});

it('Buy it again shows what was bought before at today’s price, one tap back into the cart (India store paths)', () => {
  const items = [bought('b1', { priceMinor: 49_900, curBase: 'INR', market: 'IN' }, 3), bought('b2', { sizes: ['S', 'M'], market: 'IN', curBase: 'INR' })];
  render(<CartLists later={later} again={items} moreAgain view="again" store={amazonIn} />);
  const tabs = screen.getByRole('navigation', { name: 'Saved for later and Buy it again' });
  expect(within(tabs).getByRole('link', { name: 'Buy it again' })).toHaveAttribute('aria-current', 'page');
  expect(within(tabs).getByRole('link', { name: 'Saved for later (2 items)' })).toHaveAttribute('href', '/in/cart#your-lists');
  const rows = within(screen.getByRole('region', { name: 'Buy it again' })).getAllByRole('listitem');
  expect(within(rows[0]).getByRole('link', { name: 'Product b1' })).toHaveAttribute('href', '/in/product/b1');
  expect(within(rows[0]).getByText('₹499')).toBeInTheDocument();
  expect(within(rows[0]).getByText(/^Last bought .* · 3 orders$/)).toBeInTheDocument();
  expect(within(rows[0]).getByRole('button', { name: 'Add to cart: Product b1' })).toBeInTheDocument();
  // something that comes in sizes needs one picked on its page
  expect(within(rows[1]).queryByRole('button', { name: /Add to cart/ })).toBeNull();
  expect(screen.getByRole('link', { name: 'See everything you’ve bought before' })).toHaveAttribute('href', '/in/orders/buy-again');
  expect(screen.queryByRole('link', { name: 'Product s1' })).toBeNull();
});

it('shows a list on its own, under its heading, when there is only one', () => {
  render(<CartLists later={null} again={[bought('b1')]} moreAgain={false} view="later" store={amazon} />);
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Buy it again' })).not.toHaveClass('sr-only');
  expect(screen.queryByRole('link', { name: /See everything/ })).toBeNull();
  cleanup();

  render(<CartLists later={later} again={[]} moreAgain={false} view="again" store={amazon} />);
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Saved for later (2 items)' })).not.toHaveClass('sr-only');
  cleanup();

  const { container } = render(<CartLists later={{ collectionId: 'c1', items: [] }} again={[]} moreAgain={false} view="later" store={amazon} />);
  expect(container).toBeEmptyDOMElement();
});

it('cartList reads the picked list', () => {
  expect(cartList('again')).toBe('again');
  expect(cartList(['again', 'later'])).toBe('again');
  expect(cartList('bogus')).toBe('later');
  expect(cartList(undefined)).toBe('later');
});

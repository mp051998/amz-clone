import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CollectionItem } from '@/lib/decision/types';
import type { Product } from '@/lib/types';

const state = vi.hoisted(() => ({ moved: [] as string[][], removed: [] as string[][], refreshed: 0, moveResult: { ok: true } as unknown }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => state.refreshed++, push: () => {} }) }));
vi.mock('@/app/actions/collections', () => ({
  moveCartItemToSaved: async () => ({ collectionName: 'Saved for later' }),
  moveSavedToCart: async (cid: string, id: string) => {
    state.moved.push([cid, id]);
    return state.moveResult;
  },
  removeFromCollection: async (cid: string, id: string) => {
    state.removed.push([cid, id]);
    return { ok: true };
  },
}));
vi.mock('@/app/cart/actions', () => ({ swapCartLine: async () => ({ ok: true }) }));

import { SavedForLater } from './SavedForLater';

function item(id: string, over: Partial<Product> = {}, savedPriceMinor = 1999): CollectionItem {
  return {
    product: {
      id, market: 'US', title: `Product ${id}`, category: 'c', categoryName: 'C', image: '', priceMinor: 1999, rating: 4, reviewCount: 1,
      seller: 'S', shipsFrom: 'S', bullets: [], stock: 20, curBase: 'USD', ...over,
    },
    savedPriceMinor,
    addedAt: '2026-10-01T00:00:00Z',
  };
}

const sp = (p: string) => `/in${p}`;

afterEach(cleanup);
beforeEach(() => {
  state.moved = [];
  state.removed = [];
  state.refreshed = 0;
  state.moveResult = { ok: true };
});

it('lists the saved items at today’s price, with what each can do', () => {
  render(<SavedForLater collectionId="c1" sp={sp} items={[item('a', { priceMinor: 1499 }), item('b', { stock: 0 }), item('c', { archived: true })]} />);
  expect(screen.getByRole('heading', { name: 'Saved for later (3 items)' })).toBeInTheDocument();
  const rows = screen.getAllByRole('listitem');
  expect(within(rows[0]).getByRole('link', { name: 'Product a' })).toHaveAttribute('href', '/in/product/a');
  expect(within(rows[0]).getByText('$14.99')).toBeInTheDocument();
  expect(within(rows[0]).getByText('↓ $5.00 less than when you saved it')).toBeInTheDocument();
  expect(within(rows[0]).getByRole('button', { name: 'Move Product a to cart' })).toBeInTheDocument();
  expect(within(rows[1]).getByText('Out of stock')).toBeInTheDocument();
  expect(within(rows[1]).queryByRole('button', { name: /Move/ })).toBeNull();
  expect(within(rows[2]).getByText('No longer available')).toBeInTheDocument();
  expect(within(rows[2]).getByRole('button', { name: 'Delete Product c from Saved for later' })).toBeInTheDocument();
});

it('moves an item to the cart and refreshes', async () => {
  render(<SavedForLater collectionId="c1" sp={sp} items={[item('a')]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Move Product a to cart' }));
  await waitFor(() => expect(state.refreshed).toBe(1));
  expect(state.moved).toEqual([['c1', 'a']]);
});

it('does not refresh when the move fails', async () => {
  state.moveResult = { error: 'out_of_stock', message: 'Sold out.' };
  render(<SavedForLater collectionId="c1" sp={sp} items={[item('a')]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Move Product a to cart' }));
  await waitFor(() => expect(state.moved).toHaveLength(1));
  expect(state.refreshed).toBe(0);
});

it('deletes an item', async () => {
  render(<SavedForLater collectionId="c1" sp={sp} items={[item('a')]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Product a from Saved for later' }));
  await waitFor(() => expect(state.removed).toEqual([['c1', 'a']]));
});

it('renders nothing for an empty list', () => {
  const { container } = render(<SavedForLater collectionId="c1" sp={sp} items={[]} />);
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole('heading')).toBeNull();
});

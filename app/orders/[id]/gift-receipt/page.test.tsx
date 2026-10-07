import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/types';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Sam Lee', email: 'sam@b.test' } as unknown,
  order: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', async (original) => ({ ...(await original<typeof import('@/lib/auth')>()), readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/orders', () => ({ getOrder: async () => state.order }));

import GiftReceiptPage from './page';

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'ORD-77',
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 5000, shipMinor: 0, taxMinor: 413, totalMinor: 5413 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [
      { productId: 'a', title: 'Kettle', image: '', seller: 'Kettle Co', unitPriceMinor: 1500, qty: 2 },
      { productId: 'b', title: 'Mug', image: '', seller: 'Store', unitPriceMinor: 2000, qty: 1 },
    ],
    createdAt: '2026-10-01T10:00:00Z',
    placedAt: '2026-10-01T10:00:05Z',
    gift: { message: 'Happy birthday!\nLove, Sam' },
    ...over,
  };
}

async function show(sp: { item?: string } = {}) {
  render(await GiftReceiptPage({ params: Promise.resolve({ id: 'ORD-77' }), searchParams: Promise.resolve(sp) }));
}

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', name: 'Sam Lee', email: 'sam@b.test' };
  state.order = order();
});

it('lists the items and quantities with no prices, who it’s from and the gift note', async () => {
  await show();
  expect(screen.getByRole('heading', { level: 1, name: 'Gift receipt' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Enjoy your gift from Sam' })).toBeInTheDocument();
  expect(screen.getByText(/Happy birthday!/)).toHaveTextContent('Happy birthday! Love, Sam');
  expect(screen.getByText('ORD-77')).toBeInTheDocument();
  const rows = within(screen.getByRole('table')).getAllByRole('row');
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText('Kettle')).toBeInTheDocument();
  expect(within(rows[1]).getByText('2')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\$/);
  expect(screen.getByText(/within 30 days of delivery/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Print gift receipt' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Back to order' })).toHaveAttribute('href', '/orders/ORD-77?placed=0');
});

it('narrows to one item, and ignores an item not in the order', async () => {
  await show({ item: 'b' });
  expect(screen.getByRole('heading', { name: 'Item' })).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  expect(screen.getByText('Mug')).toBeInTheDocument();
  expect(screen.queryByText('Kettle')).toBeNull();
  cleanup();
  await show({ item: 'zzz' });
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
});

it('an ordinary order has no note; India gets its return window and paths', async () => {
  state.store = amazonIn;
  state.order = order({ market: 'IN', currency: 'INR', gift: undefined });
  await show();
  expect(screen.queryByText(/Happy birthday/)).toBeNull();
  expect(screen.getByText(/within 10 days of delivery/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '← Back to order' })).toHaveAttribute('href', '/in/orders/ORD-77?placed=0');
});

it('sends the signed-out to sign in, the wrong store to the right one, and unplaced orders back', async () => {
  state.user = null;
  await expect(show()).rejects.toThrow('REDIRECT /signin?next=%2Forders%2FORD-77%2Fgift-receipt');
  state.user = { id: 'u1', name: 'Sam Lee', email: 'sam@b.test' };
  state.order = order({ market: 'IN', currency: 'INR' });
  await expect(show()).rejects.toThrow('REDIRECT /in/orders/ORD-77/gift-receipt');
  for (const status of ['awaiting_payment', 'cancelled'] as const) {
    state.order = order({ status });
    await expect(show()).rejects.toThrow('REDIRECT /orders/ORD-77?placed=0');
  }
  state.order = null;
  await expect(show()).rejects.toThrow('NOT_FOUND');
});

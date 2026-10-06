import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/types';
import { amazon } from '@/lib/amazon';

const state = vi.hoisted(() => ({ order: null as unknown, pairs: [] as unknown[], paired: [] as string[][], reviewed: [] as string[] }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => amazon }));
vi.mock('@/lib/auth', () => ({ readUser: async () => ({ id: 'u1', email: 'a@b.test' }), firstName: () => 'Asha' }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/orders', () => ({ getOrder: async () => state.order }));
vi.mock('@/lib/data/reviews', () => ({ reviewedProductIds: async () => new Set(state.reviewed) }));
vi.mock('@/lib/data/catalog', () => ({ getProducts: async (_db: unknown, ids: string[]) => ids.map((id) => ({ id, market: 'US' })) }));
vi.mock('@/lib/decision/server', () => ({
  accessoriesFor: async (bought: { id: string }[]) => {
    state.paired.push(bought.map((p) => p.id));
    return state.pairs;
  },
}));
vi.mock('@/lib/data/returns', () => ({ getOrderReturns: async () => ({ delivered: true, returnable: {}, returns: [] }), canStartReturn: () => false }));
vi.mock('@/app/actions/order', () => ({ cancelMyOrder: async () => {} }));
vi.mock('@/app/actions/returns', () => ({ cancelMyReturn: async () => {} }));
vi.mock('@/app/actions/cart', () => ({ addToCart: async () => {} }));

import OrderPage from './page';

function order(over: Partial<Order> = {}): Order {
  return {
    id: 'ORD-9',
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 3000, shipMinor: 0, taxMinor: 0, totalMinor: 3000 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [
      { productId: 'k 1', title: 'Kettle', image: '', seller: 'Store', unitPriceMinor: 1000, qty: 1 },
      { productId: 'm', title: 'Mug', image: '', seller: 'Store', unitPriceMinor: 2000, qty: 1 },
    ],
    createdAt: '2026-09-01T10:00:00Z',
    placedAt: '2026-09-01T10:00:00Z',
    ...over,
  };
}

async function show() {
  render(await OrderPage({ params: Promise.resolve({ id: 'ORD-9' }), searchParams: Promise.resolve({ placed: '0' }) }));
}

afterEach(cleanup);
beforeEach(() => {
  state.order = order();
  state.pairs = [];
  state.paired = [];
  state.reviewed = [];
});

it('offers a review for each item once the order is delivered', async () => {
  state.order = order({ deliveredAt: '2026-09-04T10:00:00Z' });
  await show();
  expect(screen.getByRole('link', { name: 'Write a product review: Kettle' })).toHaveAttribute('href', '/product/k%201#write-review');
  expect(screen.getByRole('link', { name: 'Write a product review: Mug' })).toHaveAttribute('href', '/product/m#write-review');
});

it('says Edit for what the shopper has already reviewed', async () => {
  state.order = order({ deliveredAt: '2026-09-04T10:00:00Z' });
  state.reviewed = ['m'];
  await show();
  expect(screen.getByRole('link', { name: 'Write a product review: Kettle' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Edit your review: Mug' })).toHaveAttribute('href', '/product/m#write-review');
  expect(screen.queryByRole('link', { name: 'Write a product review: Mug' })).toBeNull();
});

it('not before it arrives, nor for a cancelled order', async () => {
  // delivery is booked at placement: no review link until that time passes
  state.order = order({ shippedAt: '2998-12-30T10:00:00Z', outForDeliveryAt: '2999-01-01T08:00:00Z', deliveredAt: '2999-01-01T10:00:00Z' });
  await show();
  expect(screen.queryByRole('link', { name: /Write a product review/ })).toBeNull();
  cleanup();
  state.order = order({ status: 'cancelled', deliveredAt: undefined });
  await show();
  expect(screen.queryByRole('link', { name: /Write a product review/ })).toBeNull();
});

it('the thank-you page offers add-ons for what was just ordered', async () => {
  state.pairs = [{ product: { id: 'f', title: 'Kettle Descaler Filter', image: '', priceMinor: 799, curBase: 'USD' }, reason: 'Goes with your Kettle · under $10' }];
  render(await OrderPage({ params: Promise.resolve({ id: 'ORD-9' }), searchParams: Promise.resolve({ placed: '1' }) }));
  expect(screen.getByRole('heading', { name: 'Order placed, thanks Asha.' })).toBeInTheDocument();
  const row = screen.getByRole('region', { name: 'Goes with your order' });
  expect(row).toHaveTextContent('Goes with your Kettle · under $10');
  expect(screen.getByRole('button', { name: 'Add Kettle Descaler Filter to cart' })).toBeInTheDocument();
  expect(state.paired).toEqual([['k 1', 'm']]);
});

it('no add-ons row when nothing pairs', async () => {
  render(await OrderPage({ params: Promise.resolve({ id: 'ORD-9' }), searchParams: Promise.resolve({ placed: '1' }) }));
  expect(screen.queryByRole('region', { name: 'Goes with your order' })).toBeNull();
});

it('a gift order shows its note', async () => {
  state.order = order({ gift: { message: 'Happy birthday!\nLove, Sam' } });
  await show();
  expect(screen.getByText('Gift', { selector: 'dt' }).nextElementSibling).toHaveTextContent('“Happy birthday! Love, Sam”');
  cleanup();
  state.order = order({ gift: {} });
  await show();
  expect(screen.getByText('Gift', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Yes, no message');
});

it('no gift row for an ordinary order', async () => {
  await show();
  expect(screen.queryByText('Gift', { selector: 'dt' })).toBeNull();
});

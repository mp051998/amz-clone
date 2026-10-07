import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/types';
import type { PublicMarketplace } from '@/lib/contracts';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({ order: null as unknown, store: null as unknown }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/decision', () => ({ ProductFrame: () => <span /> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => ({ id: 'u1', email: 'a@b.test' }) }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/orders', () => ({ getOrder: async () => state.order }));
vi.mock('@/lib/data/returns', async (original) => ({
  ...(await original<typeof import('@/lib/data/returns')>()),
  getOrderReturns: async () => ({ delivered: true, returnBy: '2099-01-01T00:00:00Z', returnable: { p1: 1 }, replaceable: {}, returns: [] }),
}));
vi.mock('@/app/actions/returns', () => ({ startReturn: async () => {} }));

import ReturnPage from './page';

function order(over: Partial<Order> = {}): Order {
  return {
    id: '114-0000000-0000000',
    market: 'US',
    currency: 'USD',
    status: 'placed',
    paymentMethod: 'card',
    paymentLabel: 'Visa ending 4242',
    totals: { subtotalMinor: 2000, shipMinor: 0, taxMinor: 0, totalMinor: 2000 },
    shipTo: { name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', postcode: '78701' },
    items: [{ productId: 'p1', title: 'Lamp', image: '', seller: 'Store', unitPriceMinor: 2000, qty: 1 }],
    createdAt: '2026-09-01T10:00:00Z',
    placedAt: '2026-09-01T10:00:00Z',
    deliveredAt: '2026-09-03T10:00:00Z',
    ...over,
  };
}

async function show(o: Order, store: PublicMarketplace = amazon) {
  state.order = o;
  state.store = store;
  render(await ReturnPage({ params: Promise.resolve({ id: o.id }), searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
  state.order = null;
  state.store = amazon;
});
afterEach(cleanup);

it('offers the refund back to how they paid, or on the gift card balance', async () => {
  await show(order());
  expect(screen.getByText(/Refunds go to Visa ending 4242, or your gift card balance if you’d rather, once the items reach us\./)).toBeTruthy();
  const back = screen.getByRole('radio', { name: /Back to how you paid/ }) as HTMLInputElement;
  const balance = screen.getByRole('radio', { name: /To your gift card balance/ }) as HTMLInputElement;
  expect(screen.getByRole('group', { name: 'Where should the refund go?' })).toBeTruthy();
  expect([back.name, back.value, back.defaultChecked]).toEqual(['refundTo', 'original', true]);
  expect([balance.name, balance.value, balance.defaultChecked]).toEqual(['refundTo', 'balance', false]);
  expect(screen.getByText(/Card refunds take 5–10 business days to show up\./)).toBeTruthy();
});

it('in India the balance is the wallet, including for cash on delivery', async () => {
  await show(order({ market: 'IN', currency: 'INR', paymentMethod: 'cod', paymentLabel: 'Pay on delivery' }), amazonIn);
  expect(screen.getByText(/To your bank account, once the items reach us\./)).toBeTruthy();
  expect(screen.getByRole('radio', { name: /To your wallet balance/ })).toBeTruthy();
});

it('doesn’t ask when the order was paid from the balance', async () => {
  await show(order({ paymentMethod: 'giftcard', paymentLabel: 'Gift card balance' }));
  expect(screen.getByText(/Refunds go to your gift card balance once the items reach us\./)).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Where should the refund go?' })).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
});

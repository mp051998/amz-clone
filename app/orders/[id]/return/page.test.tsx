import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/types';
import type { PublicMarketplace } from '@/lib/contracts';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const ONE = { delivered: true, returnBy: '2099-01-01T12:00:00Z', returnByItem: { p1: '2099-01-01T12:00:00Z' }, returnable: { p1: 1 }, replaceable: {}, returns: [] };
const state = vi.hoisted(() => ({ order: null as unknown, store: null as unknown, returns: null as unknown, points: [] as unknown[] }));

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
  getOrderReturns: async () => state.returns,
}));
vi.mock('@/lib/data/pickup', () => ({ listPickupPoints: async () => state.points }));
vi.mock('@/app/actions/returns', () => ({ startReturn: async () => {} }));

const LOCKER = { id: 'US-AUS-BLUEBONNET', kind: 'locker', name: 'Hub Locker – Bluebonnet', line1: '1000 E 41st St', city: 'Austin', state: 'TX', postcode: '78751', hours: 'Open 24 hours', holdDays: 3 };

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
  state.returns = ONE;
  state.points = [LOCKER];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
  expect(screen.queryAllByRole('radio').filter((r) => (r as HTMLInputElement).name === 'refundTo')).toEqual([]);
});

it('asks how it goes back: dropped off, anywhere or at a Hub point, or picked up from the address', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T18:00:00Z')); // Thursday 11 AM in Seattle
  await show(order());
  const how = screen.getByRole('group', { name: 'How will you send it back?' });
  const drop = within(how).getByRole('radio', { name: /Drop it off/ }) as HTMLInputElement;
  const pickup = within(how).getByRole('radio', { name: /Have it picked up/ }) as HTMLInputElement;
  expect([drop.name, drop.value, drop.defaultChecked]).toEqual(['method', 'dropoff', true]);
  expect([pickup.name, pickup.value, pickup.defaultChecked]).toEqual(['method', 'pickup', false]);
  expect(within(how).getByText(/A courier collects it from 1 Main St, Austin 78701\./)).toBeTruthy();

  const where = within(how).getByRole('combobox', { name: 'Where' }) as HTMLSelectElement;
  expect(where.name).toBe('point');
  expect([...where.options].map((o) => [o.value, o.text])).toEqual([
    ['', 'Any drop-off point'],
    ['US-AUS-BLUEBONNET', 'Hub Locker – Bluebonnet, 1000 E 41st St, Austin · Open 24 hours'],
  ]);
  const day = within(how).getByRole('combobox', { name: 'Pickup day' }) as HTMLSelectElement;
  expect(day.name).toBe('pickupOn');
  // from tomorrow, a week ahead
  expect([...day.options].map((o) => o.value)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
  expect(day.options[0].text).toBe('Tomorrow, October 9');
  expect(day.options[1].text).toBe('Saturday, October 10');
});

it('only offers a drop-off for an order collected from a pickup point', async () => {
  await show(order({ pickup: { pointId: 'US-AUS-BLUEBONNET', code: '123456' } }));
  const how = screen.getByRole('group', { name: 'How will you send it back?' });
  expect(within(how).getByRole('radio', { name: /Drop it off/ })).toBeTruthy();
  expect(within(how).queryByRole('radio', { name: /Have it picked up/ })).toBeNull();
  expect(within(how).queryByRole('combobox', { name: 'Pickup day' })).toBeNull();
});

it('gives one return-by date when every item shares it', async () => {
  await show(order());
  expect(screen.getByText(/^Eligible until Thursday, January 1\. Refunds go to/)).toBeTruthy();
  expect(screen.queryByText(/return by/)).toBeNull();
});

it('gives a replacement its own, later return-by, item by item', async () => {
  state.returns = {
    ...ONE,
    returnBy: '2099-02-01T12:00:00Z',
    returnByItem: { p1: '2099-01-01T12:00:00Z', p2: '2099-02-01T12:00:00Z' },
    returnable: { p1: 1, p2: 1 },
  };
  await show(order({ items: [...order().items, { productId: 'p2', title: 'Mug', image: '', seller: 'Store', unitPriceMinor: 900, qty: 2 }] }));
  expect(screen.getByText(/^Eligible until Thursday, January 1; replacement items until Sunday, February 1\. Refunds go to/)).toBeTruthy();
  expect(screen.getByText(/1 ordered · return by January 1/)).toBeTruthy();
  expect(screen.getByText(/1 of 2 left to return · return by February 1/)).toBeTruthy();
});

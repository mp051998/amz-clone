import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/types';
import { amazon } from '@/lib/amazon';

const state = vi.hoisted(() => ({ order: null as unknown, pairs: [] as unknown[], paired: [] as string[][], reviewed: [] as string[], feedback: [] as [string, unknown][] }));

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
vi.mock('@/app/actions/order', () => ({
  archiveMyOrder: async () => {},
  cancelMyOrder: async () => {},
  payForOrder: async () => {},
  updateOrderInstructions: async () => {},
  rateSeller: async () => {},
  removeSellerRating: async () => {},
}));
vi.mock('@/lib/data/seller-feedback', async (original) => ({
  ...(await original<typeof import('@/lib/data/seller-feedback')>()),
  orderFeedback: async () => new Map(state.feedback),
}));
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

async function show(params: Record<string, string> = {}) {
  render(await OrderPage({ params: Promise.resolve({ id: 'ORD-9' }), searchParams: Promise.resolve({ placed: '0', ...params }) }));
}

afterEach(cleanup);
beforeEach(() => {
  state.order = order();
  state.pairs = [];
  state.paired = [];
  state.reviewed = [];
  state.feedback = [];
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

it('an unpaid card order offers to finish paying or cancel', async () => {
  state.order = order({ status: 'awaiting_payment', paymentLabel: undefined });
  await show();
  const pay = screen.getByRole('region', { name: 'Payment' });
  expect(pay).toHaveTextContent('This order isn’t paid yet');
  expect(screen.getByRole('button', { name: 'Complete payment' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
  cleanup();
  state.order = order();
  await show();
  expect(screen.queryByRole('region', { name: 'Payment' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Complete payment' })).toBeNull();
});

it('an order can be archived, and an archived one says so and can come back', async () => {
  await show();
  expect(screen.getByRole('button', { name: 'Archive order' })).toBeInTheDocument();
  cleanup();

  state.order = order({ archivedAt: '2026-09-02T10:00:00Z' });
  await show();
  expect(screen.getByRole('button', { name: 'Unarchive order' })).toBeInTheDocument();
  expect(screen.getByText(/This order is archived/)).toBeInTheDocument();
  cleanup();

  await show({ archived: '1' });
  expect(screen.getByText(/Order archived/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Archived orders' })).toHaveAttribute('href', '/orders?period=archived');
  cleanup();

  state.order = order();
  await show({ archived: '0' });
  expect(screen.getByText('Order unarchived. It’s back in your order list.')).toBeInTheDocument();
});

it('an unpaid order has nothing to archive', async () => {
  state.order = order({ status: 'awaiting_payment', placedAt: undefined });
  await show();
  expect(screen.queryByRole('button', { name: 'Archive order' })).toBeNull();
});

const FUTURE = { shippedAt: '2998-12-30T10:00:00Z', outForDeliveryAt: '2999-01-01T08:00:00Z', deliveredAt: '2999-01-01T10:00:00Z' };

it('delivery instructions can change while the order is being prepared or shipped', async () => {
  state.order = order({ ...FUTURE, shipTo: { ...order().shipTo, instructions: 'Gate code 4321' } });
  await show();
  expect(screen.getByText('Change delivery instructions')).toBeInTheDocument();
  expect(screen.getByLabelText('Delivery instructions (optional)')).toHaveValue('Gate code 4321');
  expect(screen.getByRole('button', { name: 'Save instructions' })).toBeInTheDocument();
  cleanup();

  // shipped, not yet out for delivery: still open; no note yet says Add
  state.order = order({ shippedAt: '2026-09-01T20:00:00Z', outForDeliveryAt: '2999-01-01T08:00:00Z', deliveredAt: '2999-01-01T10:00:00Z' });
  await show();
  expect(screen.getByText('Add delivery instructions')).toBeInTheDocument();
  expect(screen.getByLabelText('Delivery instructions (optional)')).toHaveValue('');
});

it('not once it is out for delivery or delivered, unpaid or cancelled', async () => {
  for (const o of [
    order({ shippedAt: '2026-09-01T20:00:00Z', outForDeliveryAt: '2026-09-02T09:00:00Z', deliveredAt: '2999-01-01T10:00:00Z' }),
    order({ deliveredAt: '2026-09-04T10:00:00Z' }),
    order({ status: 'awaiting_payment' }),
    order({ status: 'cancelled' }),
  ]) {
    state.order = o;
    await show();
    expect(screen.queryByRole('button', { name: 'Save instructions' })).toBeNull();
    cleanup();
  }
});

it('confirms the change', async () => {
  state.order = order({ ...FUTURE, shipTo: { ...order().shipTo, instructions: 'Leave it at the back door' } });
  await show({ instructions: 'saved' });
  expect(screen.getByText('Delivery instructions updated for this order.')).toBeInTheDocument();
  expect(screen.getByText('Leave it at the back door', { selector: 'dd span' })).toBeInTheDocument();
  cleanup();
  state.order = order(FUTURE);
  await show({ instructions: 'cleared' });
  expect(screen.getByText('Delivery instructions removed from this order.')).toBeInTheDocument();
});

it('says why a change did not go through', async () => {
  state.order = order({ deliveredAt: '2026-09-04T10:00:00Z' });
  await show({ error: 'order_not_editable' });
  expect(screen.getByText('This order is already out for delivery, so its delivery instructions can’t change now.')).toBeInTheDocument();
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const twoSellers = [
  { productId: 'k', title: 'Kettle', image: '', seller: 'Kettle Co', unitPriceMinor: 1000, qty: 1 },
  { productId: 'm', title: 'Mug', image: '', seller: 'Mugs Inc', unitPriceMinor: 2000, qty: 1 },
  { productId: 'm2', title: 'Mug lid', image: '', seller: 'Mugs Inc', unitPriceMinor: 500, qty: 1 },
];
const rated = {
  orderId: 'ORD-9', seller: 'Mugs Inc', rating: 4, arrivedOnTime: true, asDescribed: false, comment: 'Lid was the wrong size.',
  createdAt: daysAgo(1), updatedAt: daysAgo(1),
};

it('once delivered, asks for feedback on each seller in the order', async () => {
  state.order = order({ deliveredAt: daysAgo(2), items: twoSellers });
  await show();
  const section = screen.getByRole('region', { name: 'Seller feedback' });
  expect(section).toHaveTextContent('Sold by Kettle Co');
  expect(section).toHaveTextContent('Sold by Mugs Inc');
  expect(screen.getAllByText('Leave seller feedback')).toHaveLength(2);
  expect(screen.getAllByRole('radio', { name: '5 stars' })).toHaveLength(2);
  expect(screen.getAllByRole('radio', { name: '1 star' })[0]).toBeRequired();
  expect(screen.getAllByLabelText(/^Comments/)).toHaveLength(2);
});

it('shows feedback already left, to change or remove', async () => {
  state.order = order({ deliveredAt: daysAgo(2), items: twoSellers });
  state.feedback = [['Mugs Inc', rated]];
  await show();
  const section = screen.getByRole('region', { name: 'Seller feedback' });
  expect(section).toHaveTextContent('Arrived on time · Not as described');
  expect(section).toHaveTextContent('Lid was the wrong size.');
  expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
  expect(screen.getByText('Change your feedback')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove your feedback for Mugs Inc' })).toBeInTheDocument();
  expect(screen.getAllByRole('radio', { name: '4 stars' })[1]).toBeChecked();
  expect(screen.getByText('Leave seller feedback')).toBeInTheDocument();
});

it('after 90 days keeps what was left, read-only, and asks for nothing new', async () => {
  state.order = order({ deliveredAt: daysAgo(100), items: twoSellers });
  state.feedback = [['Mugs Inc', rated]];
  await show();
  const section = screen.getByRole('region', { name: 'Seller feedback' });
  expect(section).toHaveTextContent('Sold by Mugs Inc');
  expect(section).not.toHaveTextContent('Kettle Co');
  expect(screen.queryByText('Change your feedback')).toBeNull();
  expect(screen.queryByRole('button', { name: /Remove your feedback/ })).toBeNull();
  cleanup();
  state.feedback = [];
  await show();
  expect(screen.queryByRole('region', { name: 'Seller feedback' })).toBeNull();
});

it('not before the order arrives', async () => {
  state.order = order({ ...FUTURE, items: twoSellers });
  await show();
  expect(screen.queryByRole('region', { name: 'Seller feedback' })).toBeNull();
});

it('confirms feedback saved or removed', async () => {
  state.order = order({ deliveredAt: daysAgo(2) });
  await show({ feedback: 'saved' });
  expect(screen.getByText('Thanks, your seller feedback is saved.')).toBeInTheDocument();
  cleanup();
  await show({ feedback: 'removed' });
  expect(screen.getByText('Your seller feedback is removed.')).toBeInTheDocument();
});

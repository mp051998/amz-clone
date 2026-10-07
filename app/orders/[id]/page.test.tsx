import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Order } from '@/lib/types';
import { amazon } from '@/lib/amazon';

const state = vi.hoisted(() => ({ order: null as unknown, pairs: [] as unknown[], paired: [] as string[][], reviewed: [] as string[], feedback: [] as [string, unknown][], addresses: [] as unknown[], addressReads: 0, returns: [] as unknown[], delivery: null as unknown, stock: {} as Record<string, number> }));

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
vi.mock('@/lib/data/addresses', () => ({
  listAddresses: async () => {
    state.addressReads++;
    return state.addresses;
  },
}));
vi.mock('@/lib/data/reviews', () => ({ reviewedProductIds: async () => new Set(state.reviewed) }));
vi.mock('@/lib/data/catalog', () => ({ getProducts: async (_db: unknown, ids: string[]) => ids.map((id) => ({ id, market: 'US', stock: state.stock[id] })) }));
vi.mock('@/lib/decision/server', () => ({
  accessoriesFor: async (bought: { id: string }[]) => {
    state.paired.push(bought.map((p) => p.id));
    return state.pairs;
  },
}));
vi.mock('@/lib/data/returns', async (original) => ({
  ...(await original<typeof import('@/lib/data/returns')>()),
  getOrderReturns: async () => ({ delivered: true, returnable: {}, replaceable: {}, returns: state.returns }),
  canStartReturn: () => false,
}));
vi.mock('@/app/actions/order', () => ({
  archiveMyOrder: async () => {},
  cancelMyOrder: async () => {},
  payForOrder: async () => {},
  updateOrderInstructions: async () => {},
  changeOrderAddress: async () => {},
  rateSeller: async () => {},
  removeSellerRating: async () => {},
  rateDelivery: async () => {},
  removeDeliveryRating: async () => {},
}));
vi.mock('@/lib/data/delivery-feedback', async (original) => ({
  ...(await original<typeof import('@/lib/data/delivery-feedback')>()),
  deliveryFeedbackFor: async () => state.delivery,
}));
vi.mock('@/lib/data/seller-feedback', async (original) => ({
  ...(await original<typeof import('@/lib/data/seller-feedback')>()),
  orderFeedback: async () => new Map(state.feedback),
}));
vi.mock('@/app/actions/returns', () => ({ cancelMyReturn: async () => {}, reportMissing: async () => {} }));
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
  state.stock = {};
  state.pairs = [];
  state.paired = [];
  state.reviewed = [];
  state.feedback = [];
  state.delivery = null;
  state.addresses = [];
  state.addressReads = 0;
  state.returns = [];
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

it('a gift-wrapped order says so, with the wrap in its totals and in a cancellation’s refund', async () => {
  state.order = order({
    gift: { wrapped: true },
    totals: { subtotalMinor: 2000, shipMinor: 0, taxMinor: 160, wrapMinor: 399, totalMinor: 2559 },
  });
  await show();
  expect(screen.getByText('Gift', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Gift-wrapped, no message');
  expect(screen.getByText('Gift wrap', { selector: 'dt' }).nextElementSibling).toHaveTextContent('$3.99');
  cleanup();
  state.order = order({
    gift: { message: 'Enjoy', wrapped: true },
    totals: { subtotalMinor: 2000, shipMinor: 0, taxMinor: 0, wrapMinor: 399, totalMinor: 2399 },
    items: [order().items[1]],
    cancellations: [
      {
        id: 'c1',
        items: [order().items[0]],
        itemsMinor: 1000,
        taxMinor: 80,
        wrapMinor: 399,
        refund: { status: 'succeeded', amountMinor: 1479, refundedAt: '2026-09-01T11:00:00Z' },
        createdAt: '2026-09-01T11:00:00Z',
      },
    ],
  });
  await show();
  expect(screen.getByText('Gift', { selector: 'dt' }).nextElementSibling).toHaveTextContent('“Enjoy”Gift-wrapped');
  expect(screen.getByRole('article', { name: 'Cancelled items' })).toHaveTextContent('Includes $0.80 tax and $3.99 gift wrap.');
});

it('shows a protection plan bought with an item, in the totals, and refunded with a cancelled item', async () => {
  const [kettle, mug] = order().items;
  state.order = order({
    totals: { subtotalMinor: 2000, shipMinor: 0, taxMinor: 160, protectionMinor: 398, totalMinor: 2558 },
    items: [{ ...kettle, protectionMinor: 199 }, mug],
  });
  await show();
  expect(screen.getByText(/^\+ 2-Year Protection Plan/)).toHaveTextContent(`+ 2-Year Protection Plan · $${(199 * kettle.qty / 100).toFixed(2)}`);
  expect(screen.getByText('Protection plans', { selector: 'dt' }).nextElementSibling).toHaveTextContent('$3.98');
  cleanup();
  state.order = order({
    items: [mug],
    cancellations: [
      {
        id: 'c1',
        items: [{ ...kettle, protectionMinor: 199 }],
        itemsMinor: 1000,
        taxMinor: 80,
        wrapMinor: 399,
        protectionMinor: 199,
        refund: { status: 'succeeded', amountMinor: 1678, refundedAt: '2026-09-01T11:00:00Z' },
        createdAt: '2026-09-01T11:00:00Z',
      },
    ],
  });
  await show();
  expect(screen.getByRole('article', { name: 'Cancelled items' })).toHaveTextContent('Includes $0.80 tax, $3.99 gift wrap and $1.99 protection plans.');
});

it('links a gift receipt for the order, and for each item of a several-item order', async () => {
  await show();
  expect(screen.getByRole('link', { name: 'Gift receipt' })).toHaveAttribute('href', '/orders/ORD-9/gift-receipt');
  expect(screen.getByRole('link', { name: 'Gift receipt for Kettle' })).toHaveAttribute('href', '/orders/ORD-9/gift-receipt?item=k%201');
  expect(screen.getByRole('link', { name: 'Gift receipt for Mug' })).toHaveAttribute('href', '/orders/ORD-9/gift-receipt?item=m');
  cleanup();
  state.order = order({ items: [order().items[0]] });
  await show();
  expect(screen.getByRole('link', { name: 'Gift receipt' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /^Gift receipt for/ })).toBeNull();
  for (const status of ['awaiting_payment', 'cancelled'] as const) {
    cleanup();
    state.order = order({ status, placedAt: status === 'cancelled' ? '2026-09-01T10:00:00Z' : undefined });
    await show();
    expect(screen.queryByRole('link', { name: /^Gift receipt/ })).toBeNull();
  }
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

const home = { id: 'a-home', name: 'Asha Rao', phone: '5550100', line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701', isDefault: true };
const office = { id: 'a-office', name: 'Asha Rao', phone: '5550100', line1: '500 Congress Ave', line2: 'Suite 300', city: 'Austin', state: 'TX', zip: '78701', instructions: 'Front desk' };
const mom = { id: 'a-mom', name: 'Meera Rao', phone: '5550199', line1: '9 Elm St', city: 'Dallas', state: 'TX', zip: '75201' };

it('the address can change to another saved one while the order is being prepared', async () => {
  state.order = order(FUTURE);
  state.addresses = [home, office, mom];
  await show();
  expect(screen.getByText('Change delivery address')).toBeInTheDocument();
  const picks = screen.getAllByRole('radio');
  // where it already goes isn't offered
  expect(picks.map((r) => (r as HTMLInputElement).value)).toEqual(['a-office', 'a-mom']);
  expect(picks[0]).toBeChecked();
  expect(screen.getByRole('radio', { name: /500 Congress Ave, Suite 300, Austin 78701/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Deliver here' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Add or edit addresses' })).toHaveAttribute('href', '/account/addresses');
});

it('with no other saved address, points to the address book', async () => {
  state.order = order(FUTURE);
  state.addresses = [home];
  await show();
  expect(screen.queryByRole('button', { name: 'Deliver here' })).toBeNull();
  expect(screen.getByText(/Your address book has no other address in this store/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Add an address' })).toHaveAttribute('href', '/account/addresses');
});

it('not once it has shipped, and without reading the address book', async () => {
  state.addresses = [home, office];
  for (const o of [
    order({ shippedAt: '2026-09-01T20:00:00Z', outForDeliveryAt: '2999-01-01T08:00:00Z', deliveredAt: '2999-01-01T10:00:00Z' }),
    order({ deliveredAt: '2026-09-04T10:00:00Z' }),
    order({ status: 'awaiting_payment' }),
    order({ status: 'cancelled' }),
  ]) {
    state.order = o;
    await show();
    expect(screen.queryByText('Change delivery address')).toBeNull();
    cleanup();
  }
  expect(state.addressReads).toBe(0);
});

it('confirms the new address, or says why it could not change', async () => {
  state.order = order({ ...FUTURE, shipTo: { name: 'Meera Rao', phone: '5550199', line1: '9 Elm St', city: 'Dallas', state: 'TX', postcode: '75201' } });
  await show({ address: 'changed' });
  expect(screen.getByText('Delivery address changed. We’ll deliver this order to Meera Rao, 9 Elm St, Dallas 75201.')).toBeInTheDocument();
  cleanup();
  state.order = order({ shippedAt: '2026-09-01T20:00:00Z', outForDeliveryAt: '2999-01-01T08:00:00Z', deliveredAt: '2999-01-01T10:00:00Z' });
  await show({ error: 'order_address_locked' });
  expect(screen.getByText('This order’s delivery address can’t change now: it has shipped, or it isn’t placed.')).toBeInTheDocument();
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
  expect(within(section).getAllByLabelText(/^Comments/)).toHaveLength(2);
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

it('once delivered, asks how the delivery went for 30 days', async () => {
  state.order = order({ deliveredAt: daysAgo(2) });
  await show();
  const section = screen.getByRole('region', { name: 'Delivery feedback' });
  expect(within(section).getByText('Leave delivery feedback')).toBeInTheDocument();
  expect(within(section).getByRole('radio', { name: 'Good' })).toBeRequired();
  expect(within(section).getByRole('radio', { name: 'Not good' })).not.toBeChecked();
  expect(within(section).getByRole('group', { name: 'What went wrong? (optional)' })).toBeInTheDocument();
  expect(within(section).getByRole('checkbox', { name: 'Package was damaged' })).not.toBeChecked();
  cleanup();

  state.order = order({ ...FUTURE });
  await show();
  expect(screen.queryByRole('region', { name: 'Delivery feedback' })).toBeNull();
});

it('shows delivery feedback already left, to change or remove, and read-only after 30 days', async () => {
  state.delivery = { orderId: 'ORD-9', positive: false, reasons: ['late', 'unsafe_spot'], comment: 'Left in the rain.', createdAt: daysAgo(1), updatedAt: daysAgo(1) };
  state.order = order({ deliveredAt: daysAgo(2) });
  await show();
  let section = screen.getByRole('region', { name: 'Delivery feedback' });
  expect(section).toHaveTextContent('You said the delivery wasn’t good');
  expect(section).toHaveTextContent('Arrived late · Left somewhere unsafe');
  expect(section).toHaveTextContent('Left in the rain.');
  expect(within(section).getByText('Change your feedback')).toBeInTheDocument();
  expect(within(section).getByRole('radio', { name: 'Not good' })).toBeChecked();
  expect(within(section).getByRole('checkbox', { name: 'Arrived late' })).toBeChecked();
  expect(within(section).getByRole('button', { name: 'Remove your delivery feedback' })).toBeInTheDocument();
  cleanup();

  state.order = order({ deliveredAt: daysAgo(40) });
  await show();
  section = screen.getByRole('region', { name: 'Delivery feedback' });
  expect(section).toHaveTextContent('Arrived late · Left somewhere unsafe');
  expect(within(section).queryByText('Change your feedback')).toBeNull();
  expect(within(section).queryByRole('button', { name: /Remove/ })).toBeNull();
  cleanup();

  // nothing left and the window closed: nothing to show
  state.delivery = null;
  await show();
  expect(screen.queryByRole('region', { name: 'Delivery feedback' })).toBeNull();
});

it('confirms delivery feedback saved or removed', async () => {
  state.order = order({ deliveredAt: daysAgo(2) });
  await show({ delivery: 'saved' });
  expect(screen.getByText('Thanks, your delivery feedback is saved.')).toBeInTheDocument();
  cleanup();
  await show({ delivery: 'removed' });
  expect(screen.getByText('Your delivery feedback is removed.')).toBeInTheDocument();
});

it('items can be cancelled one by one until it ships, and cancelled ones are listed with their refund', async () => {
  state.order = order(FUTURE);
  await show();
  expect(screen.getByRole('link', { name: 'Cancel items' })).toHaveAttribute('href', '/orders/ORD-9/cancel');
  cleanup();

  // one item left: cancelling it is cancelling the order
  state.order = order({
    ...FUTURE,
    items: [order().items[1]],
    totals: { subtotalMinor: 2000, shipMinor: 0, taxMinor: 0, totalMinor: 2000 },
    cancellations: [
      {
        id: 'c1',
        items: [{ ...order().items[0], unitDiscountMinor: 100 }],
        itemsMinor: 900,
        taxMinor: 72,
        refund: { status: 'succeeded', amountMinor: 972, refundedAt: '2026-09-01T11:00:00Z' },
        createdAt: '2026-09-01T11:00:00Z',
      },
    ],
  });
  await show({ cancelled: 'items' });
  expect(screen.getByText('Items cancelled. The rest of your order is still on its way.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Cancel items' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument();
  const cancelled = screen.getByRole('article', { name: 'Cancelled items' });
  expect(cancelled).toHaveTextContent('Kettle');
  expect(cancelled).toHaveTextContent('$9.00');
  expect(cancelled).toHaveTextContent('Refund of $9.72 to Visa ending 4242 · issued September 1.');
  expect(cancelled).toHaveTextContent('Includes $0.72 tax.');
  expect(screen.getByRole('heading', { name: '1 item' })).toBeInTheDocument();
});

it('a delivered order that never turned up can be reported for 30 days, until something is returned', async () => {
  const day = 86_400_000;
  const delivered = new Date(Date.now() - 2 * day).toISOString();
  state.order = order({ deliveredAt: delivered });
  await show();
  const section = screen.getByRole('region', { name: 'Package didn’t arrive?' });
  expect(section).toHaveTextContent(/Report it by .+ and we’ll refund \$30\.00 to Visa ending 4242\./);
  expect(screen.getByRole('button', { name: 'Report it missing' })).toBeInTheDocument();
  cleanup();
  state.order = order({ deliveredAt: new Date(Date.now() - 31 * day).toISOString() });
  await show();
  expect(screen.queryByRole('region', { name: 'Package didn’t arrive?' })).toBeNull();
  cleanup();
  state.order = order({ deliveredAt: delivered, paymentMethod: 'cod', paymentLabel: 'Cash on Delivery' });
  await show();
  expect(screen.queryByRole('region', { name: 'Package didn’t arrive?' })).toBeNull();
});

it('offers to send a missing order again when everything is still in stock', async () => {
  const delivered = new Date(Date.now() - 2 * 86_400_000).toISOString();
  state.order = order({ deliveredAt: delivered });
  state.stock = { 'k 1': 5, m: 1 };
  await show();
  const section = screen.getByRole('region', { name: 'Package didn’t arrive?' });
  expect(section).toHaveTextContent(/and we’ll send it again at no charge, or we’ll refund \$30\.00 to Visa ending 4242\./);
  fireEvent.click(screen.getByRole('button', { name: 'Send a replacement' }));
  expect(screen.getByRole('group', { name: 'Send a replacement' })).toHaveTextContent(/Send everything in this order again, at no charge\? It would arrive by .+\. There’s nothing to send back\./);
  expect(screen.getByRole('button', { name: 'Get a refund' })).toBeInTheDocument();
  cleanup();
  // one item sold out: only the refund
  state.stock = { 'k 1': 5, m: 0 };
  await show();
  expect(screen.queryByRole('button', { name: 'Send a replacement' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Report it missing' })).toBeInTheDocument();
});

it('once a replacement is on its way, says so', async () => {
  const delivered = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const arrives = new Date(Date.now() + 2 * 86_400_000).toISOString();
  state.order = order({ deliveredAt: delivered });
  state.returns = [{
    id: 'r1', orderId: 'ORD-9', status: 'received', reason: 'not_received', resolution: 'replacement',
    replacement: { shippedAt: new Date(Date.now() + 3_600_000).toISOString(), deliveredAt: arrives },
    items: [{ productId: 'm', title: 'Mug', image: '', unitPriceMinor: 2000, qty: 1 }],
    itemsMinor: 0, taxMinor: 0, shipMinor: 0, refundMinor: 0, dropoffCode: 'AB12-CD34', dropoffBy: delivered,
    createdAt: delivered, receivedAt: delivered, refund: { status: 'succeeded', refundedAt: delivered },
  }];
  await show({ return: 'missing-replacement' });
  expect(screen.getByText('Sorry your order didn’t arrive. We’re sending it again at no charge, as shown below.')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Package didn’t arrive?' })).toBeNull();
});

it('once reported, says it was refunded instead', async () => {
  const delivered = new Date(Date.now() - 2 * 86_400_000).toISOString();
  state.order = order({ deliveredAt: delivered });
  state.returns = [{
    id: 'r1', orderId: 'ORD-9', status: 'received', reason: 'not_received', resolution: 'refund',
    items: [{ productId: 'm', title: 'Mug', image: '', unitPriceMinor: 2000, qty: 1 }],
    itemsMinor: 3000, taxMinor: 0, shipMinor: 0, refundMinor: 3000, dropoffCode: 'AB12-CD34', dropoffBy: delivered,
    createdAt: delivered, receivedAt: delivered, refund: { status: 'succeeded', refundedAt: delivered },
  }];
  await show({ return: 'missing' });
  expect(screen.getByText('Sorry your order didn’t arrive. We’ve refunded it, as shown below.')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Package didn’t arrive?' })).toBeNull();
});

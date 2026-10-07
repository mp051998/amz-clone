import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/app/actions/cart', () => ({ buyNow: async () => {} }));
const { addToCartInline } = vi.hoisted(() => ({ addToCartInline: vi.fn(async () => ({ ok: true, count: 1 })) }));
vi.mock('@/app/product/[id]/actions', () => ({ addToCartInline }));
vi.mock('../decision/Compare', () => ({ CompareToggle: () => null }));
vi.mock('../decision/SaveButton', () => ({ SaveButton: () => null }));
vi.mock('../collections/AddToList', () => ({ AddToList: () => null }));
vi.mock('../decision/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));

import { BuyPanel, type BuyPanelProps } from './BuyPanel';

afterEach(cleanup);

function show(delivery: Partial<BuyPanelProps['delivery']> = {}, extra: Partial<BuyPanelProps> = {}) {
  render(
    <BuyPanel
      {...extra}
      productId="p1"
      name="Kettle"
      market="US"
      stock={5}
      saved={false}
      confidence={{ level: 'High', rows: [] }}
      delivery={{ member: 'Plus', headline: 'FREE delivery', promise: 'Tomorrow, October 8', ...delivery }}
    />,
  );
}

it('shows the standard day, and the faster option with how long it lasts', () => {
  show({ fastest: 'Today by 7:30 PM', orderWithin: 'Order within 2 hrs 13 mins', to: 'to Seattle 98109' });
  expect(screen.getByText('Tomorrow, October 8')).toBeInTheDocument();
  expect(screen.getByText(/Or fastest delivery/)).toHaveTextContent('Or fastest delivery Today by 7:30 PM. Order within 2 hrs 13 mins');
  expect(screen.getByText('Delivering to Seattle 98109')).toBeInTheDocument();
});

it('leaves the faster line out when checkout would not offer it', () => {
  show();
  expect(screen.queryByText(/Or fastest/)).toBeNull();
  expect(screen.queryByText(/Delivering/)).toBeNull();
});

it('marks the faster option FREE for a Plus member', () => {
  show({ headline: 'FREE delivery with your membership', fastest: 'Today by 7:30 PM', fastFree: true });
  expect(screen.getByText('FREE delivery with your membership')).toBeInTheDocument();
  expect(screen.getByText(/fastest delivery/)).toHaveTextContent('Or FREE fastest delivery Today by 7:30 PM');
});

it('offers the store’s protection plan, which Buy Now and Add to Cart both take', async () => {
  show({}, { protection: { name: '2-Year Protection Plan', price: '$7.99' } });
  const box = screen.getByRole('checkbox', { name: /2-Year Protection Plan for \$7\.99/ });
  const form = box.closest('form')!;
  expect(new FormData(form).get('protection')).toBeNull();
  fireEvent.click(box);
  expect(new FormData(form).get('protection')).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
  await waitFor(() => expect(addToCartInline).toHaveBeenLastCalledWith('p1', 1, true, null));
});

it('has no plan box for a product the store doesn’t cover', async () => {
  show();
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
  await waitFor(() => expect(addToCartInline).toHaveBeenLastCalledWith('p1', 1, false, null));
});

it('says the limit per customer, and caps the quantity at what’s left of it', () => {
  show({}, { limit: { max: 3, left: 2 } });
  expect(screen.getByText('Limit 3 per customer · You can buy 2 more')).toBeInTheDocument();
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['1', '2']);
  cleanup();

  // signed out: the whole limit
  show({}, { limit: { max: 3, left: null } });
  expect(screen.getByText('Limit 3 per customer')).toBeInTheDocument();
  expect(screen.getAllByRole('option')).toHaveLength(3);
});

it('offers nothing more to buy once the limit is reached', () => {
  show({}, { limit: { max: 2, left: 0 } });
  expect(screen.getByText('Limit 2 per customer · You’ve bought 2')).toBeInTheDocument();
  expect(screen.getByText('You’ve bought as many of this item as one customer can.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Buy Now' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add to Cart' })).toBeNull();
});

it('asks for a size before Add to Cart or Buy Now, then both take it', async () => {
  addToCartInline.mockClear();
  show({}, { sizes: ['S', 'M', 'L'] });
  expect(screen.getByText(/^Size:/)).toHaveTextContent('Size: Select');
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Select a size first.');
  expect(addToCartInline).not.toHaveBeenCalled();
  const form = screen.getByRole('button', { name: 'Buy Now' }).closest('form')!;
  expect(fireEvent.submit(form)).toBe(false); // held back until there's a size

  fireEvent.click(screen.getByRole('radio', { name: 'M' }));
  expect(screen.getByText(/^Size:/)).toHaveTextContent('Size: M');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(new FormData(form).get('size')).toBe('M');
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
  await waitFor(() => expect(addToCartInline).toHaveBeenLastCalledWith('p1', 1, false, 'M'));
});

it('has a size chart for sizes it knows, the size picked highlighted', () => {
  show({}, { sizes: ['S', 'M', 'L'] });
  expect(screen.getByText('Size Chart')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'L' }));
  expect(screen.getByRole('row', { current: true })).toHaveTextContent(/^L/);
});

it('has no size to pick for a product without sizes', () => {
  show();
  expect(screen.queryByText(/^Size:/)).toBeNull();
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.queryByText('Size Chart')).toBeNull();
});

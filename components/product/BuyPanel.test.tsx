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
  await waitFor(() => expect(addToCartInline).toHaveBeenLastCalledWith('p1', 1, true));
});

it('has no plan box for a product the store doesn’t cover', async () => {
  show();
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
  await waitFor(() => expect(addToCartInline).toHaveBeenLastCalledWith('p1', 1, false));
});

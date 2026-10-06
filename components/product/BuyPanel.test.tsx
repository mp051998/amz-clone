import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/app/actions/cart', () => ({ buyNow: async () => {} }));
vi.mock('@/app/product/[id]/actions', () => ({ addToCartInline: async () => ({ ok: true }) }));
vi.mock('../decision/Compare', () => ({ CompareToggle: () => null }));
vi.mock('../decision/SaveButton', () => ({ SaveButton: () => null }));
vi.mock('../decision/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));

import { BuyPanel, type BuyPanelProps } from './BuyPanel';

afterEach(cleanup);

function show(delivery: Partial<BuyPanelProps['delivery']> = {}) {
  render(
    <BuyPanel
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

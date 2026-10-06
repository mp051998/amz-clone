import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const action = vi.hoisted(() => ({ setCouponClipped: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@/app/actions/coupons', () => action);
vi.mock('../decision/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));

import { CouponToggle } from './CouponToggle';

afterEach(cleanup);
beforeEach(() => {
  nav.push.mockReset();
  nav.refresh.mockReset();
  action.setCouponClipped.mockReset();
});

const base = { productId: 'p1', percentOff: 15, market: 'US' as const, next: '/product/p1' };

it('signed out, applying sends the shopper to sign in and back', () => {
  render(<CouponToggle {...base} clipped={false} signedIn={false} savingText="$4.50" />);
  expect(screen.getByText('Save $4.50 each')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Apply 15% coupon'));
  expect(nav.push).toHaveBeenCalledWith('/signin?next=%2Fproduct%2Fp1');
  expect(action.setCouponClipped).not.toHaveBeenCalled();
});

it('applies the coupon and refreshes the prices', async () => {
  action.setCouponClipped.mockResolvedValue({ clipped: true });
  render(<CouponToggle {...base} market="IN" clipped={false} signedIn />);
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Apply 15% coupon'));
  });
  expect(action.setCouponClipped).toHaveBeenCalledWith('p1', true);
  expect(screen.getByLabelText('15% coupon applied')).toBeChecked();
  expect(nav.refresh).toHaveBeenCalled();
});

it('goes back to unapplied when the coupon can’t be applied', async () => {
  action.setCouponClipped.mockResolvedValue({ error: 'coupon_not_found', message: 'That coupon isn’t available any more.' });
  render(<CouponToggle {...base} clipped={false} signedIn />);
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Apply 15% coupon'));
  });
  expect(screen.getByLabelText('Apply 15% coupon')).not.toBeChecked();
  expect(nav.refresh).not.toHaveBeenCalled();
});

it('an applied coupon can be removed', async () => {
  action.setCouponClipped.mockResolvedValue({ clipped: false });
  render(<CouponToggle {...base} clipped signedIn savingText="$4.50" />);
  expect(screen.getByText('Saving $4.50 each at checkout')).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByLabelText('15% coupon applied'));
  });
  expect(action.setCouponClipped).toHaveBeenCalledWith('p1', false);
});

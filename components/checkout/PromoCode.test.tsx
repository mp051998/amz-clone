import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { PromoCode } from './PromoCode';

afterEach(cleanup);
beforeEach(() => router.replace.mockClear());

it('applies a typed code by reloading checkout with it, keeping the rest of the query', () => {
  render(<PromoCode checkoutPath="/in/checkout" query="buy=in-kettle&qty=2" />);
  const field = screen.getByLabelText('Add a promotion code');
  expect(field).not.toHaveAttribute('name');
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  fireEvent.change(field, { target: { value: ' style20 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(router.replace).toHaveBeenCalledWith('/in/checkout?buy=in-kettle&qty=2&promo=STYLE20', { scroll: false });
});

it('applies on Enter without submitting the order form', () => {
  const submit = vi.fn((e: Event) => e.preventDefault());
  render(<form onSubmit={(e) => submit(e.nativeEvent)}><PromoCode checkoutPath="/checkout" query="" /></form>);
  const field = screen.getByLabelText('Add a promotion code');
  fireEvent.change(field, { target: { value: 'save10' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(router.replace).toHaveBeenCalledWith('/checkout?promo=SAVE10', { scroll: false });
  expect(submit).not.toHaveBeenCalled();
});

it('keeps a code that didn’t apply in the field with why', () => {
  render(<PromoCode checkoutPath="/checkout" query="" tried={{ code: 'SAVE10', problem: 'Spend $50.00 or more on qualifying items to use that promotion code.' }} />);
  expect(screen.getByLabelText('Add a promotion code')).toHaveValue('SAVE10');
  expect(screen.getByText('Spend $50.00 or more on qualifying items to use that promotion code.')).toBeInTheDocument();
});

it('sends an applied code with the order, and removes it', () => {
  const { container } = render(<PromoCode checkoutPath="/checkout" query="promo=SAVE10" applied={{ code: 'SAVE10', description: '10% off your order', savings: '$5.40' }} />);
  expect(screen.getByText('SAVE10 applied · −$5.40')).toBeInTheDocument();
  expect(container.querySelector('input[type=hidden][name=promo]')).toHaveValue('SAVE10');
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(router.replace).toHaveBeenCalledWith('/checkout', { scroll: false });
});

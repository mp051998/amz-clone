import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { OrderTerms } from './OrderTerms';

afterEach(cleanup);

it('links the privacy notice and conditions of use, in the store', () => {
  render(<OrderTerms href={(p) => `/in${p}`} stripe currency="INR" />);
  expect(screen.getByRole('link', { name: 'privacy notice' })).toHaveAttribute('href', '/in/legal/privacy-notice');
  expect(screen.getByRole('link', { name: 'conditions of use' })).toHaveAttribute('href', '/in/legal/conditions-of-use');
  expect(screen.getByText(/By placing your order, you agree to the store’s/)).toHaveTextContent('Cards are paid on Stripe in INR');
});

it('says nothing is charged without Stripe', () => {
  render(<OrderTerms href={(p) => p} stripe={false} currency="USD" />);
  expect(screen.getByText(/By placing your order/)).toHaveTextContent('privacy notice and conditions of use. No real charge is made.');
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/app/actions/gift-cards', () => ({ buyGiftCardAction: async () => ({}) }));

import { BuyForm } from './BuyForm';

afterEach(cleanup);

const props = { denoms: [25, 50, 100], min: 1, max: 2000, symbol: '$', locale: 'en-US' };
const hidden = (c: HTMLElement) => (c.querySelector('input[name="amountMinor"]') as HTMLInputElement).value;

it('sends the chosen amount in minor units', () => {
  const { container } = render(<BuyForm {...props} />);
  expect(hidden(container)).toBe('5000');
  fireEvent.click(screen.getByLabelText('$100'));
  expect(hidden(container)).toBe('10000');
  expect(screen.getByRole('button', { name: 'Buy $100 gift card' })).toBeEnabled();
});

it('checks a custom amount as it’s typed', () => {
  const { container } = render(<BuyForm {...props} />);
  fireEvent.click(screen.getByLabelText(/Custom/, { selector: 'input[type="radio"]' }));
  const field = screen.getByLabelText('Custom amount ($)');
  expect(screen.getByRole('button', { name: 'Buy gift card' })).toBeDisabled();

  fireEvent.change(field, { target: { value: '5000' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole amount from $1 to $2,000.');
  expect(hidden(container)).toBe('');

  fireEvent.change(field, { target: { value: '12.50' } });
  expect(screen.getByRole('button', { name: 'Buy gift card' })).toBeDisabled();

  fireEvent.change(field, { target: { value: '$1,500' } });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(hidden(container)).toBe('150000');
  expect(screen.getByRole('button', { name: 'Buy $1,500 gift card' })).toBeEnabled();
});

it('counts the message', () => {
  render(<BuyForm {...props} defaultMessage="Enjoy!" />);
  expect(screen.getByText('6/240')).toBeInTheDocument();
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ProductPerks } from './ProductPerks';

afterEach(cleanup);

it('shows each perk as a button opening its note', () => {
  render(
    <ProductPerks
      perks={[
        { key: 'cod', label: 'Pay on Delivery', detail: 'Pay by cash, UPI or card when it arrives.' },
        { key: 'secure', label: 'Secure transaction', detail: 'Your payment is encrypted.' },
      ]}
    />,
  );
  const cod = screen.getByRole('button', { name: 'Pay on Delivery' });
  expect(cod).toHaveAttribute('popovertarget', 'perk-cod');
  const note = document.getElementById('perk-cod')!;
  expect(note).toHaveAttribute('popover', 'auto');
  expect(note).toHaveTextContent('Pay by cash, UPI or card when it arrives.');
  expect(screen.getByRole('button', { name: 'Secure transaction' })).toHaveAttribute('popovertarget', 'perk-secure');
});

it('renders nothing without perks', () => {
  const { container } = render(<ProductPerks perks={[]} />);
  expect(container).toBeEmptyDOMElement();
});

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ProductPerks } from './ProductPerks';

afterEach(cleanup);

it('shows each perk as a button opening its note', () => {
  render(
    <ProductPerks
      perks={[
        { key: 'cod', label: 'Pay on Delivery', detail: 'Pay by cash, UPI or card when it arrives.' },
        { key: 'fulfilled', label: 'Amazon Delivered', detail: 'Amazon packs, ships and delivers this item itself.' },
        { key: 'secure', label: 'Secure transaction', detail: 'Your payment is encrypted.' },
      ]}
    />,
  );
  const cod = screen.getByRole('button', { name: 'Pay on Delivery' });
  expect(cod).toHaveAttribute('popovertarget', 'perk-cod');
  const note = document.getElementById('perk-cod')!;
  expect(note).toHaveAttribute('popover', 'auto');
  expect(note).toHaveTextContent('Pay by cash, UPI or card when it arrives.');
  expect(screen.getByRole('button', { name: 'Amazon Delivered' })).toHaveAttribute('popovertarget', 'perk-fulfilled');
  expect(screen.getByRole('button', { name: 'Secure transaction' })).toHaveAttribute('popovertarget', 'perk-secure');
});

it('renders nothing without perks', () => {
  const { container } = render(<ProductPerks perks={[]} />);
  expect(container).toBeEmptyDOMElement();
});

it('tables the return rules, with how to hand it back and the full policy', () => {
  render(
    <ProductPerks
      perks={[
        {
          key: 'returns',
          label: '10 days Returnable',
          detail: 'Return it within 10 days of delivery for a full refund.',
          rules: [
            { reason: 'Damaged or defective', period: '10 days from delivery', policy: 'Full refund or replacement' },
            { reason: 'Any other reason', period: '10 days from delivery', policy: 'Full refund' },
          ],
          instructions: 'Keep the item in its original packaging.',
          more: { label: 'Read full returns policy', href: '/in/customer-service/help/returns-refunds' },
        },
      ]}
    />,
  );
  const note = document.getElementById('perk-returns')!;
  const table = within(note).getByRole('table', { hidden: true });
  expect(within(table).getAllByRole('columnheader', { hidden: true }).map((c) => c.textContent)).toEqual(['Return reason', 'Return period', 'Return policy']);
  expect(within(table).getAllByRole('row', { hidden: true }).slice(1).map((r) => r.textContent)).toEqual([
    'Damaged or defective10 days from deliveryFull refund or replacement',
    'Any other reason10 days from deliveryFull refund',
  ]);
  expect(note).toHaveTextContent('Return instructionsKeep the item in its original packaging.');
  expect(within(note).getByRole('link', { hidden: true, name: 'Read full returns policy' })).toHaveAttribute('href', '/in/customer-service/help/returns-refunds');
});

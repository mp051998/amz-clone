import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DeliverySpeed } from './DeliverySpeed';

afterEach(cleanup);

it('defaults to standard and sends the chosen speed', () => {
  const { container } = render(
    <form>
      <DeliverySpeed
        standard={{ label: 'Standard delivery', sub: 'Arriving tomorrow, October 8 · FREE' }}
        fast={{ label: 'Same-Day delivery', sub: 'Arriving today by 7:30 PM · $9.99' }}
      />
    </form>,
  );
  const form = () => new FormData(container.querySelector('form')!);
  expect(screen.getByRole('group', { name: 'Delivery speed' })).toBeInTheDocument();
  expect(form().get('shipSpeed')).toBe('standard');

  fireEvent.click(screen.getByLabelText(/Same-Day delivery/));
  expect(form().get('shipSpeed')).toBe('fast');
  // the summary's CSS switch keys off this id
  expect(container.querySelector('#ship-fast')).toBeChecked();
});

it('offers the Delivery Day, with or without faster delivery', () => {
  const { container } = render(
    <form>
      <DeliverySpeed
        standard={{ label: 'Standard delivery', sub: 'Arriving tomorrow, October 8 · FREE' }}
        day={{ label: 'Your Delivery Day · Friday', sub: 'Arriving Friday, October 9 · FREE · fewer boxes, fewer trips' }}
      />
    </form>,
  );
  const form = () => new FormData(container.querySelector('form')!);
  expect(container.querySelector('#ship-fast')).toBeNull();
  fireEvent.click(screen.getByLabelText(/Your Delivery Day/));
  expect(form().get('shipSpeed')).toBe('day');
  expect(container.querySelector('#ship-day')).toBeChecked();
  fireEvent.click(screen.getByLabelText(/Standard delivery/));
  expect(form().get('shipSpeed')).toBe('standard');
});

it('offers No-Rush Shipping', () => {
  const { container } = render(
    <form>
      <DeliverySpeed
        standard={{ label: 'Standard delivery', sub: 'Arriving tomorrow, October 8 · FREE' }}
        noRush={{ label: 'No-Rush Shipping', sub: 'Arriving Monday, October 12 · FREE · get a $1.00 reward on your gift card balance when it ships' }}
      />
    </form>,
  );
  const form = () => new FormData(container.querySelector('form')!);
  expect(screen.getByText(/get a \$1\.00 reward/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/No-Rush Shipping/));
  expect(form().get('shipSpeed')).toBe('no_rush');
  expect(container.querySelector('#ship-no-rush')).toBeChecked();
});

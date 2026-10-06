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

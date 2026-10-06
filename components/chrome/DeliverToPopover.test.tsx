import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const setDeliverTo = vi.fn();
vi.mock('@/app/actions/deliver-to', () => ({ setDeliverTo: (...args: unknown[]) => setDeliverTo(...args) }));
const { DeliverToPopover } = await import('./DeliverToPopover');

const home = { id: 'a1', name: 'Asha', line1: '12 MG Road', city: 'Bengaluru', zip: '560001', isDefault: true };
const work = { id: 'a2', name: 'Asha (work)', line1: '4 Residency Rd', city: 'Bengaluru', zip: '560025' };

beforeEach(() => setDeliverTo.mockReset());
afterEach(cleanup);

it('lists saved addresses and marks the current one', () => {
  render(<DeliverToPopover schema="IN" postcodeLabel="Pincode" locationText="Bengaluru 560001" userName="Asha" current={{ postcode: '560001', city: 'Bengaluru' }} addresses={[home, work]} />);
  fireEvent.click(screen.getByRole('button', { name: /Deliver to/ }));
  const dialog = screen.getByRole('dialog', { name: 'Choose your location' });
  expect(dialog).toHaveFocus();
  expect(screen.getByRole('button', { name: /^Asha\s*·\s*Default/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /work/ })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByLabelText('Pincode')).toHaveValue('');
});

it('saves the picked address and closes', async () => {
  setDeliverTo.mockResolvedValue({ saved: 1 });
  render(<DeliverToPopover schema="IN" postcodeLabel="Pincode" locationText="Bengaluru 560001" userName="Asha" addresses={[home, work]} />);
  const trigger = screen.getByRole('button', { name: /Deliver to/ });
  fireEvent.click(trigger);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /work/ })));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const data = setDeliverTo.mock.calls[0][1] as FormData;
  expect([data.get('postcode'), data.get('city')]).toEqual(['560025', 'Bengaluru']);
  expect(trigger).toHaveFocus();
});

it('shows why a postcode was refused and stays open', async () => {
  setDeliverTo.mockResolvedValue({ error: 'Enter a 5-digit ZIP Code.' });
  render(<DeliverToPopover schema="US" postcodeLabel="ZIP Code" locationText="Update location" signInHref="/signin" />);
  fireEvent.click(screen.getByRole('button', { name: /Deliver to/ }));
  expect(screen.getByRole('link', { name: 'Sign in to see your addresses' })).toHaveAttribute('href', '/signin');
  fireEvent.change(screen.getByLabelText('ZIP Code'), { target: { value: '123' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Apply' })));
  expect(await screen.findByText('Enter a 5-digit ZIP Code.')).toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByLabelText('ZIP Code')).toHaveAttribute('aria-invalid', 'true');
});

it('closes on Escape', () => {
  render(<DeliverToPopover schema="US" postcodeLabel="ZIP Code" locationText="94103" current={{ postcode: '94103' }} />);
  fireEvent.click(screen.getByRole('button', { name: /Deliver to/ }));
  expect(screen.getByLabelText('ZIP Code')).toHaveValue('94103');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

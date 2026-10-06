import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Address } from '@/lib/types';
import { AddressStep } from './AddressStep';

afterEach(cleanup);

const home: Address = { id: 'a1', name: 'Alex Morgan', phone: '2065550123', line1: '410 Terry Ave N', city: 'Seattle', state: 'WA', zip: '98109', instructions: 'Gate code 4321', isDefault: true };
const work: Address = { id: 'a2', name: 'Alex Morgan', phone: '2065550123', line1: '2021 7th Ave', city: 'Seattle', state: 'WA', zip: '98121' };

const posted = (container: HTMLElement) => new FormData(container.querySelector('form')!);

it("a saved address brings its delivery instructions, editable for this order", () => {
  const { container } = render(<form><AddressStep addresses={[home, work]} isIN={false} manageHref="/account/addresses" /></form>);
  const note = screen.getByLabelText('Delivery instructions (optional)');
  expect(note).toHaveValue('Gate code 4321');
  expect(screen.getByText('For this order. Change the saved note in your address book.')).toBeInTheDocument();
  fireEvent.change(note, { target: { value: 'Leave it at the back door' } });
  expect(posted(container).get('instructions')).toBe('Leave it at the back door');

  // still posted while the address list is open
  fireEvent.click(screen.getByRole('button', { name: 'Change delivery address' }));
  expect(posted(container).get('instructions')).toBe('Leave it at the back door');
});

it("another address starts from that address's own note", () => {
  const { container } = render(<form><AddressStep addresses={[home, work]} isIN={false} manageHref="/account/addresses" /></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Change delivery address' }));
  fireEvent.click(screen.getByLabelText(/2021 7th Ave/));
  expect(screen.getByLabelText('Delivery instructions (optional)')).toHaveValue('');
  expect(posted(container).getAll('instructions')).toEqual(['']);
});

it('a new address takes its note with the other fields', () => {
  const { container } = render(<form><AddressStep addresses={[]} isIN={false} manageHref="/account/addresses" /></form>);
  fireEvent.change(screen.getByLabelText('Delivery instructions (optional)'), { target: { value: 'Ring twice' } });
  expect(posted(container).getAll('instructions')).toEqual(['Ring twice']);
});

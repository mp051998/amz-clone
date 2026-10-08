import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Address, PickupPoint } from '@/lib/types';
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

const locker: PickupPoint = { id: 'US-SEA-JUNIPER', kind: 'locker', name: 'Hub Locker – Juniper', line1: '2121 7th Ave', city: 'Seattle', state: 'WA', postcode: '98121', hours: 'Open 24 hours', holdDays: 3 };
const counter: PickupPoint = { id: 'US-BOS-BACKBAY', kind: 'counter', name: 'Hub Counter – Back Bay', line1: '800 Boylston St', city: 'Boston', state: 'MA', postcode: '02199', hours: 'Daily 10 AM–8 PM', holdDays: 14 };

it('a pickup point posts its id with who collects it, and no address or note', () => {
  const { container } = render(<form><AddressStep addresses={[home]} isIN={false} manageHref="/account/addresses" pickupPoints={[locker, counter]} /></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Change delivery address' }));
  expect(screen.getByText('Or pick it up at a Hub Locker or Counter')).toBeInTheDocument();
  expect(screen.getByLabelText(/Hub Counter – Back Bay/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/Hub Locker – Juniper/));

  expect(screen.getByText('Pick up at Hub Locker – Juniper')).toBeInTheDocument();
  expect(screen.getByText(/holds it for 3 days/)).toBeInTheDocument();
  expect(screen.getByLabelText('Who’s collecting it')).toHaveValue('Alex Morgan');
  expect(screen.getByLabelText('Phone number')).toHaveValue('2065550123');
  const form = posted(container);
  expect(form.get('pickupPoint')).toBe('US-SEA-JUNIPER');
  expect(form.get('fullName')).toBe('Alex Morgan');
  expect(form.get('line1')).toBeNull();
  expect(form.get('instructions')).toBeNull();
});

it('without pickup points there is no pickup choice', () => {
  render(<form><AddressStep addresses={[home]} isIN={false} manageHref="/account/addresses" /></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Change delivery address' }));
  expect(screen.queryByText('Or pick it up at a Hub Locker or Counter')).toBeNull();
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/app/actions/cart', () => ({ addBundle: vi.fn() }));
const { BoughtTogether } = await import('./BoughtTogether');

const items = [
  { id: 'p1', title: 'Kettle', image: '/k.jpg', href: '/in/product/p1', priceMinor: 149900, current: true },
  { id: 'p2', title: 'Descaler', image: '/d.jpg', href: '/in/product/p2', priceMinor: 29900 },
  { id: 'p3', title: 'Mug set', image: '/m.jpg', href: '/in/product/p3', priceMinor: 50000 },
];

afterEach(cleanup);

it('ticks everything to start and adds up the total', () => {
  render(<BoughtTogether productId="p1" items={items} currency="INR" />);
  expect(screen.getByRole('checkbox', { name: /This item:\s*Kettle/ })).toBeChecked();
  expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).checked)).toBe(true);
  expect(screen.getByText(/Total price/)).toHaveTextContent('₹2,298');
  expect(screen.getByRole('button', { name: 'Add all three to cart' })).toBeEnabled();
  expect(screen.getByRole('link', { name: 'View Descaler' })).toHaveAttribute('href', '/in/product/p2');
});

it('follows the ticks in the total and the button', () => {
  render(<BoughtTogether productId="p1" items={items} currency="INR" />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Mug set/ }));
  expect(screen.getByText(/Total price/)).toHaveTextContent('₹1,798');
  expect(screen.getByRole('button', { name: 'Add both to cart' })).toBeEnabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Kettle/ }));
  expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Descaler/ }));
  expect(screen.getByRole('button', { name: 'Choose items to add' })).toBeDisabled();
});

it('sends the ticked ids and the page it came from', () => {
  const { container } = render(<BoughtTogether productId="p1" items={items} currency="INR" />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Descaler/ }));
  const form = container.querySelector('form')!;
  const data = new FormData(form);
  expect(data.getAll('id')).toEqual(['p1', 'p3']);
  expect(data.get('from')).toBe('p1');
});

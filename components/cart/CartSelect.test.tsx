import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/app/actions/cart', () => ({ selectItems: async () => {} }));

const { CartSelect, CartSelectAll } = await import('./CartSelect');

afterEach(cleanup);

const fields = (button: HTMLElement) => Object.fromEntries(new FormData(button.closest('form')!));

it('a ticked line offers to untick it, and the other way round', () => {
  render(<CartSelect id="p1" selected name="Kettle" />);
  const box = screen.getByRole('checkbox', { name: 'Include Kettle in this order' });
  expect(box).toHaveAttribute('aria-checked', 'true');
  expect(fields(box)).toEqual({ id: 'p1', selected: '0' });
  cleanup();

  render(<CartSelect id="p1" selected={false} name="Kettle" />);
  const off = screen.getByRole('checkbox', { name: 'Include Kettle in this order' });
  expect(off).toHaveAttribute('aria-checked', 'false');
  expect(fields(off)).toEqual({ id: 'p1', selected: '1' });
});

it('select all / deselect all names no product', () => {
  render(<CartSelectAll allSelected />);
  const button = screen.getByRole('button', { name: 'Deselect all items' });
  expect(fields(button)).toEqual({ selected: '0' });
  cleanup();
  render(<CartSelectAll allSelected={false} />);
  expect(fields(screen.getByRole('button', { name: 'Select all items' }))).toEqual({ selected: '1' });
});

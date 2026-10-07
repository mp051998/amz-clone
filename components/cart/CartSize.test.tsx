import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/app/actions/cart', () => ({ setSize: async () => {} }));

const { CartSize } = await import('./CartSize');

afterEach(cleanup);

const fields = (el: HTMLElement) => Object.fromEntries(new FormData(el.closest('form')!));

it('shows the line’s size and posts the one picked', () => {
  render(<CartSize id="p1" size="9" sizes={['8', '9', '10']} name="Running Shoe" />);
  const select = screen.getByRole('combobox', { name: 'Size for Running Shoe' });
  expect(select).toHaveValue('9');
  expect(screen.queryByRole('option', { name: 'Select' })).toBeNull();
  expect(fields(select)).toEqual({ id: 'p1', size: '9' });
  expect(screen.getByRole('button', { name: 'Update size for Running Shoe' })).toBeInTheDocument();
});

it('starts on Select when the line has no size, or one the product no longer comes in', () => {
  render(<CartSize id="p1" sizes={['S', 'M']} name="Tee" />);
  expect(screen.getByRole('combobox', { name: 'Size for Tee' })).toHaveValue('');
  expect(screen.getByRole('option', { name: 'Select' })).toBeDisabled();
  cleanup();

  render(<CartSize id="p1" size="XL" sizes={['S', 'M']} name="Tee" />);
  expect(screen.getByRole('combobox', { name: 'Size for Tee' })).toHaveValue('');
});

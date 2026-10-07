import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/app/actions/cart', () => ({ setProtection: async () => {} }));

const { CartProtection } = await import('./CartProtection');

afterEach(cleanup);

const fields = (button: HTMLElement) => Object.fromEntries(new FormData(button.closest('form')!));

it('offers the plan on a line, and drops it once added', () => {
  render(<CartProtection id="p1" added={false} plan="2-Year Protection Plan" price="$7.99" name="Headphones" />);
  const box = screen.getByRole('checkbox', { name: '2-Year Protection Plan for Headphones, $7.99' });
  expect(box).toHaveAttribute('aria-checked', 'false');
  expect(box).toHaveTextContent('Add a 2-Year Protection Plan for $7.99');
  expect(fields(box)).toEqual({ id: 'p1', on: '1' });
  cleanup();

  render(<CartProtection id="p1" added plan="2-Year Protection Plan" price="$7.99 each" name="Headphones" />);
  const on = screen.getByRole('checkbox', { name: '2-Year Protection Plan for Headphones, $7.99 each' });
  expect(on).toHaveAttribute('aria-checked', 'true');
  expect(on).toHaveTextContent('2-Year Protection Plan added for $7.99 each');
  expect(fields(on)).toEqual({ id: 'p1', on: '0' });
});

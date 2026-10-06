import { cleanup, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { Header } from './Header';

vi.mock('server-only', () => ({}));

afterEach(cleanup);

it('the phone header drops Saved on the narrowest screens so the row fits', () => {
  const { container } = render(<Header store={amazon} userName="Alex" cartCount={2} />);
  const row = container.querySelector('header > div.md\\:hidden > div') as HTMLElement;
  const saved = within(row).getByRole('link', { name: 'Saved' });
  expect(saved).toHaveAttribute('href', '/collections');
  expect(saved).toHaveClass('max-[360px]:hidden');
  // Orders and the cart always stay
  expect(within(row).getByRole('link', { name: 'Orders' })).not.toHaveClass('max-[360px]:hidden');
  expect(within(row).getByRole('link', { name: /Cart/ })).toHaveAttribute('href', '/cart');
});

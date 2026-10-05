import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./ThemeSwitch', () => ({ ThemeSwitch: () => null }));

import { Footer } from './Footer';

afterEach(cleanup);

const props = {
  storeName: 'Store',
  columns: [{ heading: 'Get to Know Us', links: [{ label: 'About', href: '/about' }, { label: 'Careers', href: 'https://example.com/jobs', external: true }] }],
  stores: [
    { id: 'US' as const, label: 'United States', meta: 'USD', href: '/', current: false },
    { id: 'IN' as const, label: 'India', meta: 'INR', href: '/in', current: true },
  ],
  legal: [{ label: 'Privacy Notice', href: '/in/legal/privacy' }],
  homeHref: '/in',
};

it('opens with a "Back to top" link to the page shell', () => {
  render(<Footer {...props} />);
  const footer = screen.getByRole('contentinfo');
  const links = within(footer).getAllByRole('link');
  expect(links[0]).toHaveTextContent('Back to top');
  expect(links[0]).toHaveAttribute('href', '#top');
});

it('lists the columns, marks the current store and opens outside links in a new tab', () => {
  render(<Footer {...props} />);
  const nav = screen.getByRole('navigation', { name: 'Get to Know Us' });
  expect(within(nav).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
  expect(within(nav).getByRole('link', { name: 'Careers' })).toHaveAttribute('target', '_blank');
  const stores = screen.getByRole('group', { name: 'Choose store' });
  expect(within(stores).getByRole('link', { name: /India/ })).toHaveAttribute('aria-current', 'true');
  expect(within(stores).getByRole('link', { name: /United States/ })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('link', { name: 'Store home' })).toHaveAttribute('href', '/in');
});

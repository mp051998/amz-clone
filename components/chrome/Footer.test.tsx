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

it('signed out, asks to sign in for personalized recommendations above the footer', () => {
  render(<Footer {...props} signIn={{ signInHref: '/in/signin?next=%2Fin%2Fcart', createAccountHref: '/in/signin?new=1&next=%2Fin%2Fcart' }} />);
  const prompt = screen.getByRole('region', { name: 'See personalized recommendations' });
  expect(within(prompt).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/in/signin?next=%2Fin%2Fcart');
  expect(prompt).toHaveTextContent('New customer? Start here.');
  expect(within(prompt).getByRole('link', { name: 'Start here.' })).toHaveAttribute('href', '/in/signin?new=1&next=%2Fin%2Fcart');
  // ahead of "Back to top"
  expect(within(screen.getByRole('contentinfo')).getAllByRole('link')[0]).toHaveTextContent('Sign in');
  cleanup();

  render(<Footer {...props} />);
  expect(screen.queryByRole('region', { name: 'See personalized recommendations' })).toBeNull();
});

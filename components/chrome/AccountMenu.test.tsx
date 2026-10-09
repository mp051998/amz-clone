import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { amazonIn } from '@/lib/marketplace-in';

vi.mock('@/app/actions/auth', () => ({ signOut: async () => {} }));

import { AccountMenu } from './AccountMenu';

afterEach(cleanup);

it('signed out, every sign-in link comes back to the page', () => {
  render(<AccountMenu store={amazonIn} signInHref="/in/signin?next=%2Fcart" createAccountHref="/in/signin?new=1&next=%2Fcart" />);
  const trigger = screen.getByRole('link', { name: /Hello, sign in/ });
  expect(trigger).toHaveAttribute('href', '/in/signin?next=%2Fcart');
  fireEvent.focus(trigger);
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/in/signin?next=%2Fcart');
  expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/in/signin?new=1&next=%2Fcart');
});

it('signed in, the trigger opens collections', () => {
  render(<AccountMenu store={amazonIn} userName="Asha" />);
  expect(screen.getByRole('link', { name: /Hello, Asha/ })).toHaveAttribute('href', '/in/collections');
});

it('without a page to return to, plain sign-in', () => {
  render(<AccountMenu store={amazonIn} />);
  expect(screen.getByRole('link', { name: /Hello, sign in/ })).toHaveAttribute('href', '/in/signin');
});

it('opens on Your Lists and Your Account columns, as Amazon does', () => {
  render(<AccountMenu store={amazonIn} userName="Asha" />);
  fireEvent.focus(screen.getByRole('link', { name: /Hello, Asha/ }));
  const lists = screen.getByRole('navigation', { name: 'Your Lists' });
  expect(within(lists).getByRole('link', { name: 'Collections' })).toHaveAttribute('href', '/in/collections');
  expect(within(lists).getByRole('link', { name: 'Registry & gift lists' })).toHaveAttribute('href', '/in/registry');
  const account = screen.getByRole('navigation', { name: 'Your Account' });
  expect(within(account).getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/in/orders');
  expect(within(account).getByRole('link', { name: 'Subscribe & Save items' })).toHaveAttribute('href', '/in/subscribe-save');
  expect(within(account).queryByRole('link', { name: /Admin/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
});

it('signed out, the columns sit under Sign in; an admin gets the admin link', () => {
  render(<AccountMenu store={amazonIn} />);
  fireEvent.focus(screen.getByRole('link', { name: /Hello, sign in/ }));
  expect(within(screen.getByRole('navigation', { name: 'Your Account' })).getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/in/orders');
  expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  cleanup();

  render(<AccountMenu store={amazonIn} userName="Asha" isAdmin />);
  fireEvent.focus(screen.getByRole('link', { name: /Hello, Asha/ }));
  expect(within(screen.getByRole('navigation', { name: 'Your Account' })).getByRole('link', { name: 'Admin · Overview' })).toHaveAttribute('href', '/in/admin');
});

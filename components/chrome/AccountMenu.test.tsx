import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

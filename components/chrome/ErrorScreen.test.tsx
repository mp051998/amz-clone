import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/product/abc' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

import { ErrorScreen } from './ErrorScreen';

afterEach(cleanup);
beforeEach(() => {
  nav.pathname = '/product/abc';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

it('says what happened, logs the error and retries', () => {
  const retry = vi.fn();
  const error = Object.assign(new Error('db down'), { digest: '12345' });
  render(<ErrorScreen error={error} retry={retry} />);
  expect(screen.getByRole('heading', { level: 1, name: "This page didn't load" })).toBeInTheDocument();
  expect(screen.getByText('12345')).toBeInTheDocument();
  expect(console.error).toHaveBeenCalledWith(error);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByRole('link', { name: 'Back to the store' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Get help' })).toHaveAttribute('href', '/customer-service');
});

it('keeps the India store in its links and leaves out a missing reference', () => {
  nav.pathname = '/in/s';
  render(<ErrorScreen error={new Error('x')} retry={() => {}} />);
  expect(screen.getByRole('link', { name: 'Store home' })).toHaveAttribute('href', '/in');
  expect(screen.getByRole('link', { name: 'Back to the store' })).toHaveAttribute('href', '/in');
  expect(screen.getByRole('link', { name: 'Get help' })).toHaveAttribute('href', '/in/customer-service');
  expect(screen.queryByText(/Reference/)).toBeNull();
});

it('does not mistake a path that only starts with "in" for the India store', () => {
  nav.pathname = '/insurance';
  render(<ErrorScreen error={new Error('x')} retry={() => {}} />);
  expect(screen.getByRole('link', { name: 'Back to the store' })).toHaveAttribute('href', '/');
});

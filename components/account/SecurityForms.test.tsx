import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AccountFormState } from '@/app/actions/account';
import { CloseAccountForm, DownloadDataCard } from './SecurityForms';

afterEach(cleanup);

it('asks for the password and a ticked box, and says what goes with the account', () => {
  render(<CloseAccountForm action={vi.fn()} losing="$25.00" ordersHref="/orders" />);
  expect(screen.getByRole('heading', { name: 'Close your account' })).toBeInTheDocument();
  expect(screen.getByText('$25.00')).toBeInTheDocument();
  expect(screen.getByText(/We keep a record of your orders and returns/)).toBeInTheDocument();
  expect(screen.getByLabelText('Current password')).toBeRequired();
  const box = screen.getByLabelText('I understand that closing my account can’t be undone.');
  expect(box).toBeRequired();
  expect(box).toHaveAttribute('value', 'yes');
  expect(screen.getByRole('button', { name: 'Close my account' })).toBeInTheDocument();
});

it('leaves out the balance line when there is none to lose', () => {
  render(<CloseAccountForm action={vi.fn()} ordersHref="/orders" />);
  expect(screen.queryByText(/gift card balance/)).toBeNull();
});

it("while something is still open, says what and offers no form", () => {
  render(<CloseAccountForm action={vi.fn()} blocked="You can’t close your account yet: you have 1 order on the way." ordersHref="/in/orders" />);
  expect(screen.getByText(/1 order on the way/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to Your Orders' })).toHaveAttribute('href', '/in/orders');
  expect(screen.queryByLabelText('Current password')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Close my account' })).toBeNull();
});

it('shows what the server said', async () => {
  const action = vi.fn(async (_prev: AccountFormState, _fd: FormData): Promise<AccountFormState> => ({
    field: 'currentPassword',
    error: 'That isn’t your current password.',
  }));
  render(<CloseAccountForm action={action} ordersHref="/orders" />);
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'nope' } });
  fireEvent.click(screen.getByLabelText('I understand that closing my account can’t be undone.'));
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Close my account' }).closest('form')!);
  });
  await waitFor(() => expect(screen.getByText('That isn’t your current password.')).toBeInTheDocument());
  expect(action.mock.calls[0][1].get('confirm')).toBe('yes');
});

it('offers the data file as a download', () => {
  render(<DownloadDataCard href="/in/account/data" />);
  expect(screen.getByRole('heading', { name: 'Download your data' })).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Download your data' });
  expect(link).toHaveAttribute('href', '/in/account/data');
  expect(link).toHaveAttribute('download');
});

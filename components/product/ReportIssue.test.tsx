import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({ calls: [] as unknown[][], reply: null as unknown }));
vi.mock('@/app/actions/product-report', () => ({
  reportProductIssue: async (...args: unknown[]) => {
    sent.calls.push(args);
    return sent.reply;
  },
}));

import { ReportIssue, type ReportIssueProps } from './ReportIssue';

const report = (over: Record<string, unknown> = {}) => ({
  id: 'r1', productId: 'p1', reason: 'pricing', details: 'Was $20 at checkout', status: 'open',
  createdAt: '2026-10-02T12:00:00Z', updatedAt: '2026-10-02T12:00:00Z', resolvedAt: null, resolutionNote: null, ...over,
}) as ReportIssueProps['open'];

const props = (over: Partial<ReportIssueProps> = {}): ReportIssueProps => ({
  productId: 'p1', signedIn: true, signinHref: '/signin?next=%2Fproduct%2Fp1%23report', open: null, locale: 'en-US', timeZone: 'UTC', ...over,
});

beforeEach(() => {
  sent.calls = [];
  sent.reply = { ok: true, report: report({ reason: 'wrong_info', details: null }), updated: false };
});
afterEach(cleanup);

it('signed-out shoppers get a sign-in link back to the report', () => {
  render(<ReportIssue {...props({ signedIn: false })} />);
  expect(screen.getByRole('link', { name: 'Sign in to report an issue with this product' })).toHaveAttribute('href', '/signin?next=%2Fproduct%2Fp1%23report');
});

it('opens the form, asks what’s wrong, and sends the report', async () => {
  render(<ReportIssue {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Report an issue with this product' }));
  expect(screen.getByRole('group', { name: 'What’s wrong?' })).toBeInTheDocument();

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send report' })));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose what’s wrong with this product.');
  fireEvent.click(screen.getByRole('radio', { name: 'Something else' }));
  fireEvent.change(screen.getByLabelText(/Tell us more/), { target: { value: 'Hmm' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send report' })));
  expect(screen.getByRole('alert')).toHaveTextContent('at least 10 characters');
  expect(sent.calls).toEqual([]);

  fireEvent.click(screen.getByRole('radio', { name: 'Product details are wrong or missing' }));
  fireEvent.change(screen.getByLabelText(/Tell us more/), { target: { value: '' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send report' })));
  expect(sent.calls).toEqual([['p1', { reason: 'wrong_info', details: '' }]]);
  expect(screen.getByRole('status')).toHaveTextContent('Thanks for telling us.');
  expect(screen.getByRole('button', { name: 'Update your report' })).toBeInTheDocument();
});

it('shows the shopper’s open report and lets them update it', async () => {
  sent.reply = { ok: true, report: report({ reason: 'counterfeit' }), updated: true };
  render(<ReportIssue {...props({ open: report() })} />);
  expect(screen.getByText(/You reported an issue with this product on October 2, 2026: the price is wrong\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Update your report' }));
  expect(screen.getByRole('radio', { name: 'The price is wrong' })).toBeChecked();
  expect(screen.getByLabelText(/Tell us more/)).toHaveValue('Was $20 at checkout');
  fireEvent.click(screen.getByRole('radio', { name: 'It may be counterfeit or not genuine' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update report' })));
  expect(sent.calls).toEqual([['p1', { reason: 'counterfeit', details: 'Was $20 at checkout' }]]);
  expect(screen.getByRole('status')).toHaveTextContent('Your report is updated.');
});

it('says why a report didn’t go through, and cancel closes the form', async () => {
  sent.reply = { ok: false, code: 'too_many_reports', message: 'You have 20 open reports already.' };
  render(<ReportIssue {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Report an issue with this product' }));
  fireEvent.click(screen.getByRole('radio', { name: 'The price is wrong' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send report' })));
  expect(screen.getByRole('alert')).toHaveTextContent('You have 20 open reports already.');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('group', { name: 'What’s wrong?' })).toBeNull();
});

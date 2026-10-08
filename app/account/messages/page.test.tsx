import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { InboxMessage } from '@/lib/data/inbox';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com' } as unknown,
  list: [] as unknown[],
  seenAt: null as string | null,
  marked: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/inbox', async (actual) => ({
  ...(await actual<typeof import('@/lib/data/inbox')>()),
  listInbox: async () => state.list,
  inboxSeenAt: async () => state.seenAt,
  markInboxSeen: async (_db: unknown, market: string) => {
    state.marked.push(market);
  },
}));

import MessagesPage from './page';

const msg = (over: Partial<InboxMessage>): InboxMessage => ({
  key: 'shipped:A-1',
  kind: 'shipped',
  at: '2026-10-05T15:00:00Z',
  subject: 'Electric Kettle 1.7L',
  href: '/orders/A-1?placed=0',
  orderId: 'A-1',
  ...over,
});

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.list = [];
  state.seenAt = '2026-10-07T00:00:00Z';
  state.marked = [];
});

it('sends the signed-out to sign in (India store paths too)', async () => {
  state.user = null;
  await expect(MessagesPage()).rejects.toThrow('REDIRECT /signin?next=/account/messages');
  state.store = amazonIn;
  await expect(MessagesPage()).rejects.toThrow('REDIRECT /in/signin?next=/account/messages');
});

it('says when there is nothing yet, and links to choosing which messages come', async () => {
  render(await MessagesPage());
  expect(screen.getByText('No messages yet')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Communication preferences' })).toHaveAttribute('href', '/account/communications');
});

it('groups messages by day, each saying what happened and linking to it', async () => {
  state.store = amazonIn;
  state.list = [
    msg({ key: 'support_reply:m1', kind: 'support_reply', at: '2026-10-06T06:00:00Z', subject: 'Parcel never came', href: '/customer-service/cases/c1', orderId: undefined }),
    msg({ key: 'refunded:B', kind: 'refunded', at: '2026-10-06T05:00:00Z', amountMinor: 249900, orderId: 'B-2', href: '/orders/B-2?placed=0' }),
    msg({ key: 'return_rejected:r2', kind: 'return_rejected', at: '2026-10-05T12:00:00Z', detail: 'Item was used' }),
    msg({ key: 'answer:a1', kind: 'answer', at: '2026-10-05T08:00:00Z', subject: 'Does it whistle?', detail: 'No, it clicks off.', from: 'Ravi', href: '/product/k#questions', orderId: undefined }),
  ];
  render(await MessagesPage());

  const today = screen.getByRole('region', { name: '6 October 2026' });
  const rows = within(today).getAllByRole('listitem');
  expect(within(rows[0]).getByText('Customer service replied')).toBeInTheDocument();
  expect(within(rows[0]).getByRole('link', { name: 'Parcel never came' })).toHaveAttribute('href', '/in/customer-service/cases/c1');
  expect(within(rows[1]).getByText('Refund issued')).toBeInTheDocument();
  expect(rows[1]).toHaveTextContent('₹2,499 back to how you paid. · Order B-2');

  const before = within(screen.getByRole('region', { name: '5 October 2026' })).getAllByRole('listitem');
  expect(within(before[0]).getByText('Return not accepted')).toBeInTheDocument();
  expect(before[0]).toHaveTextContent('We couldn’t accept it: Item was used');
  expect(within(before[1]).getByRole('link', { name: 'Does it whistle?' })).toHaveAttribute('href', '/in/product/k#questions');
  expect(before[1]).toHaveTextContent('Ravi answered: “No, it clicks off.”');
});

it('says when it was a seller who replied', async () => {
  state.list = [msg({ key: 'support_reply:m3', kind: 'support_reply', at: '2026-10-06T06:00:00Z', subject: 'Missing lid', href: '/customer-service/cases/c2', from: 'Acme Goods', orderId: undefined })];
  render(await MessagesPage());
  const [row] = screen.getAllByRole('listitem');
  expect(within(row).getByText('Seller replied')).toBeInTheDocument();
  expect(row).toHaveTextContent('Acme Goods replied to your message. Read it and answer on your case.');
  expect(within(row).queryByText('Customer service replied')).toBeNull();
});

it('says which items were cancelled and what came back for them', async () => {
  state.list = [
    msg({ key: 'items_refunded:c1', kind: 'items_refunded', at: '2026-10-06T06:05:00Z', subject: 'Mug and 1 more', amountMinor: 5400 }),
    msg({ key: 'items_cancelled:c1', kind: 'items_cancelled', at: '2026-10-06T06:00:00Z', subject: 'Mug and 1 more' }),
  ];
  render(await MessagesPage());
  const [refund, cancelled] = screen.getAllByRole('listitem');
  expect(within(refund).getByText('Refund issued')).toBeInTheDocument();
  expect(refund).toHaveTextContent('$54.00 back to how you paid, for the items you cancelled.');
  expect(within(cancelled).getByText('Items cancelled')).toBeInTheDocument();
  expect(within(cancelled).getByRole('link', { name: 'Mug and 1 more' })).toBeInTheDocument();
  expect(cancelled).toHaveTextContent('The rest of your order is still coming.');
});

it('follows a replacement to the door', async () => {
  state.list = [
    msg({ key: 'replacement_delivered:s1', kind: 'replacement_delivered', at: '2026-10-06T06:05:00Z', subject: 'Mug' }),
    msg({ key: 'replacement_shipped:s1', kind: 'replacement_shipped', at: '2026-10-05T06:00:00Z', subject: 'Mug' }),
  ];
  render(await MessagesPage());
  const [arrived, shipped] = screen.getAllByRole('listitem');
  expect(within(arrived).getByText('Replacement delivered')).toBeInTheDocument();
  expect(arrived).toHaveTextContent('Your replacement arrived.');
  expect(within(shipped).getByText('Replacement shipped')).toBeInTheDocument();
  expect(within(shipped).getByRole('link', { name: 'Mug' })).toBeInTheDocument();
  expect(shipped).toHaveTextContent('Drop off the original with your return code.');
});

it('asks for a review of what arrived, linking to the review form', async () => {
  state.list = [msg({ key: 'review_request:k', kind: 'review_request', at: '2026-10-06T06:00:00Z', subject: 'Electric Kettle', href: '/product/k#write-review' })];
  render(await MessagesPage());
  const [row] = screen.getAllByRole('listitem');
  expect(within(row).getByText('How was it?')).toBeInTheDocument();
  expect(within(row).getByRole('link', { name: 'Electric Kettle' })).toHaveAttribute('href', '/product/k#write-review');
  expect(row).toHaveTextContent('Rate it and tell other shoppers what you think.');
});

it('warns about a recall of something the shopper bought, linking to what to do', async () => {
  state.list = [msg({ key: 'recall:k', kind: 'recall', at: '2026-10-06T06:00:00Z', subject: 'Electric Kettle', href: '/recalls#recall-k', orderId: 'A-1', detail: 'The handle can overheat' })];
  render(await MessagesPage());
  const [row] = screen.getAllByRole('listitem');
  expect(within(row).getByText('Product recall')).toBeInTheDocument();
  expect(within(row).getByRole('link', { name: 'Electric Kettle' })).toHaveAttribute('href', '/recalls#recall-k');
  expect(row).toHaveTextContent('Something you bought has been recalled. The handle can overheat. See what to do.');
});

it('says a watched deal is live, and when it has ended since', async () => {
  state.list = [
    msg({ key: 'deal_live:d1', kind: 'deal_live', at: '2026-10-06T06:00:00Z', subject: 'Electric Kettle', href: '/product/k', amountMinor: 2999 }),
    msg({ key: 'deal_live:d2', kind: 'deal_live', at: '2026-10-06T05:00:00Z', subject: 'Mug', href: '/product/m', amountMinor: 500, over: true }),
  ];
  render(await MessagesPage());
  const [live, over] = screen.getAllByRole('listitem');
  expect(within(live).getByText('A deal you’re watching is live')).toBeInTheDocument();
  expect(within(live).getByRole('link', { name: 'Electric Kettle' })).toHaveAttribute('href', '/product/k');
  expect(live).toHaveTextContent('It’s on at $29.99, for a few hours or until it’s all claimed.');
  expect(over).toHaveTextContent('It went live at $5.00 and has ended since.');
});

it('says what the store decided on an A-to-z claim', async () => {
  state.list = [
    msg({ key: 'claim_granted:c1', kind: 'claim_granted', at: '2026-10-06T06:00:00Z', subject: 'Bluetooth Speaker', href: '/orders/A-1?placed=0#claims', from: 'Acme', amountMinor: 5300 }),
    msg({ key: 'claim_denied:c2', kind: 'claim_denied', at: '2026-10-06T05:00:00Z', subject: 'Mug', href: '/orders/A-2?placed=0#claims', from: 'Zed', detail: 'Tracking shows it was signed for' }),
  ];
  render(await MessagesPage());
  const [granted, denied] = screen.getAllByRole('listitem');
  expect(within(granted).getByText('A-to-z Guarantee claim granted')).toBeInTheDocument();
  expect(within(granted).getByRole('link', { name: 'Bluetooth Speaker' })).toHaveAttribute('href', '/orders/A-1?placed=0#claims');
  expect(granted).toHaveTextContent('$53.00');
  expect(within(denied).getByText('A-to-z Guarantee claim denied')).toHaveClass('text-bad');
  expect(denied).toHaveTextContent('Your claim about Zed’s items wasn’t granted: Tracking shows it was signed for.');
});

it('marks what came in since the shopper last looked, then counts it as seen', async () => {
  state.store = amazonIn;
  state.seenAt = '2026-10-05T10:00:00Z';
  state.list = [
    msg({ key: 'delivered:A-1', kind: 'delivered', at: '2026-10-06T06:00:00Z' }),
    msg({ key: 'shipped:A-1', kind: 'shipped', at: '2026-10-05T08:00:00Z' }),
  ];
  render(await MessagesPage());
  expect(screen.getByText(/1 new since you last looked\./)).toBeInTheDocument();
  const [fresh, old] = screen.getAllByRole('listitem');
  expect(within(fresh).getByText('New')).toBeInTheDocument();
  expect(fresh).toHaveTextContent('(new)');
  expect(within(old).queryByText('New')).not.toBeInTheDocument();
  expect(state.marked).toEqual(['IN']);
});

it('treats everything as new the first time', async () => {
  state.seenAt = null;
  state.list = [msg({})];
  render(await MessagesPage());
  expect(screen.getByText(/1 new since you last looked\./)).toBeInTheDocument();
  expect(state.marked).toEqual(['US']);
});

it('says a return refunded to the balance went there', async () => {
  state.store = amazonIn;
  state.list = [
    msg({ key: 'return_refunded:r1', kind: 'return_refunded', at: '2026-10-06T06:05:00Z', amountMinor: 120000, toBalance: true }),
    msg({ key: 'return_refunded:r2', kind: 'return_refunded', at: '2026-10-06T06:00:00Z', amountMinor: 90000 }),
  ];
  render(await MessagesPage());
  const [balance, back] = screen.getAllByRole('listitem');
  expect(balance).toHaveTextContent('₹1,200 added to your wallet balance, as you asked.');
  expect(back).toHaveTextContent('₹900 back to how you paid.');
});

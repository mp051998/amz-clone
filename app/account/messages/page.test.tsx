import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { InboxMessage } from '@/lib/data/inbox';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com' } as unknown,
  list: [] as unknown[],
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
});

it('sends the signed-out to sign in (India store paths too)', async () => {
  state.user = null;
  await expect(MessagesPage()).rejects.toThrow('REDIRECT /signin?next=/account/messages');
  state.store = amazonIn;
  await expect(MessagesPage()).rejects.toThrow('REDIRECT /in/signin?next=/account/messages');
});

it('says when there is nothing yet', async () => {
  render(await MessagesPage());
  expect(screen.getByText('No messages yet')).toBeInTheDocument();
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

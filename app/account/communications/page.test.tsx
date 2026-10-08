import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';

const state = vi.hoisted(() => ({ store: null as unknown, user: null as unknown, muted: new Set<string>(), asked: [] as unknown[] }));

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
vi.mock('@/app/actions/message-preferences', () => ({ setMessageTopicOn: async () => {} }));
vi.mock('@/lib/data/message-preferences', async (actual) => ({
  ...(await actual<typeof import('@/lib/data/message-preferences')>()),
  mutedTopics: async (_db: unknown, userId: string) => (state.asked.push(userId), state.muted),
}));

import CommunicationsPage from './page';

const show = async (sp: { saved?: string; error?: string } = {}) => render(await CommunicationsPage({ searchParams: Promise.resolve(sp) }));
const field = (form: HTMLElement, name: string) => (form.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;
const row = (name: string) => screen.getByRole('listitem', { name });

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', email: 'a@b.test' };
  state.muted = new Set();
  state.asked = [];
});

it('lists each kind of message that can be turned off, all on to start, and what always comes', async () => {
  await show();
  expect(state.asked).toEqual(['u1']);
  expect(screen.getByRole('heading', { level: 1, name: 'Communication preferences' })).toBeInTheDocument();
  for (const name of ['Review requests', 'Answers to your questions', 'Watched deal alerts']) {
    expect(within(row(name)).getByText('On')).toBeInTheDocument();
  }
  const off = within(row('Review requests')).getByRole('button', { name: 'Turn off review requests' });
  const form = off.closest('form') as HTMLElement;
  expect([field(form, 'topic'), field(form, 'on')]).toEqual(['review_request', '0']);
  const always = screen.getByRole('region', { name: 'Always sent' });
  expect(within(always).getByText('Product safety recalls')).toBeInTheDocument();
  expect(within(always).getByText('Refunds, returns and replacements')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('offers to turn back on what is off', async () => {
  state.muted = new Set(['deal_live']);
  await show();
  expect(within(row('Watched deal alerts')).getByText('Off')).toBeInTheDocument();
  const on = within(row('Watched deal alerts')).getByRole('button', { name: 'Turn on watched deal alerts' });
  expect(field(on.closest('form') as HTMLElement, 'on')).toBe('1');
  expect(within(row('Answers to your questions')).getByRole('button', { name: 'Turn off answers to your questions' })).toBeInTheDocument();
  expect(screen.getByText(/Turned-off messages stop showing in Your messages/)).toBeInTheDocument();
});

it('confirms a change, and says when one didn’t work', async () => {
  state.muted = new Set(['answer']);
  await show({ saved: 'answer' });
  expect(screen.getByRole('status')).toHaveTextContent('Answers to your questions turned off.');
  cleanup();
  await show({ saved: 'shipped' });
  expect(screen.queryByRole('status')).toBeNull();
  cleanup();
  await show({ error: 'internal' });
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t change that. Please try again.');
});

it('links within the India store', async () => {
  state.store = amazonIn;
  await show();
  expect(screen.getByRole('link', { name: '← Account' })).toHaveAttribute('href', '/in/account');
  expect(screen.getAllByRole('link', { name: 'Your messages' }).map((a) => a.getAttribute('href'))).toEqual(['/in/account/messages', '/in/account/messages']);
});

it('sends the signed-out to sign in', async () => {
  state.user = null;
  await expect(show()).rejects.toThrow('REDIRECT /signin?next=/account/communications');
});

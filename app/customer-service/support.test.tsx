import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { CaseOrder, SupportCase, SupportThread } from '@/lib/data/support';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com' } as unknown,
  orders: [] as unknown[],
  cases: [] as unknown[],
  thread: null as unknown,
  getCase: [] as unknown[][],
  unread: [] as string[],
  seen: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/support', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/data/support')>()),
  listCaseOrders: async () => state.orders,
  listMyCases: async () => state.cases,
  getCase: async (...args: unknown[]) => {
    state.getCase.push(args.slice(1));
    return state.thread;
  },
  unreadCaseIds: async () => new Set(state.unread),
  markCaseSeen: async (_db: unknown, id: string) => {
    state.seen.push(id);
  },
}));
vi.mock('./actions', () => ({ openCaseAction: async () => {}, replyCaseAction: async () => {}, closeCaseAction: async () => {} }));

import ContactPage from './contact/page';
import SupportCasesPage from './cases/page';
import SupportCasePage from './cases/[id]/page';

const ID = '00000000-0000-4000-8000-000000000001';

const supportCase = (over: Partial<SupportCase> = {}): SupportCase => ({
  id: ID,
  topic: 'delivery',
  subject: 'Parcel never came',
  status: 'open',
  orderId: null,
  customer: 'Asha',
  createdAt: '2026-10-02T12:00:00Z',
  updatedAt: '2026-10-03T12:00:00Z',
  closedAt: null,
  ...over,
});

const thread = (over: Partial<SupportThread> = {}): SupportThread => ({
  ...supportCase(),
  messages: [
    { id: 'm1', from: 'customer', body: 'Tracking says delivered, but nothing came.', createdAt: '2026-10-02T12:00:00Z' },
    { id: 'm2', from: 'agent', body: 'Sorry about that. We have asked the carrier.', createdAt: '2026-10-03T12:00:00Z' },
  ],
  ...over,
});

const order = (over: Partial<CaseOrder> = {}): CaseOrder => ({ id: 'ORD-1', placedAt: '2026-10-01T12:00:00Z', summary: 'Desk Lamp and 1 more', ...over });

const contact = async (sp: { order?: string; topic?: string; error?: string } = {}) => render(await ContactPage({ searchParams: Promise.resolve(sp) }));
const caseView = async (sp: { done?: string; error?: string } = {}, id = ID) =>
  render(await SupportCasePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.orders = [];
  state.cases = [];
  state.thread = thread();
  state.getCase = [];
  state.unread = [];
  state.seen = [];
});

it('sends the signed-out to sign in, keeping the order they asked about', async () => {
  state.user = null;
  await expect(ContactPage({ searchParams: Promise.resolve({ order: 'ORD-1' }) })).rejects.toThrow(
    `REDIRECT /signin?next=${encodeURIComponent('/customer-service/contact?order=ORD-1')}`,
  );
  await expect(SupportCasesPage()).rejects.toThrow('REDIRECT /signin?next=/customer-service/cases');
  state.store = amazonIn;
  await expect(SupportCasesPage()).rejects.toThrow('REDIRECT /in/signin?next=/customer-service/cases');
  await expect(SupportCasePage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) })).rejects.toThrow(
    `REDIRECT /in/signin?next=${encodeURIComponent(`/customer-service/cases/${ID}`)}`,
  );
});

it('asks what it’s about, offering the shopper’s orders and preselecting one', async () => {
  state.orders = [order(), order({ id: 'ORD-2', summary: 'Kettle' })];
  await contact({ order: 'ORD-2' });
  expect(screen.getByRole('heading', { name: 'Contact us' })).toBeInTheDocument();
  const topic = screen.getByRole('combobox', { name: 'What’s it about?' }) as HTMLSelectElement;
  expect(topic.value).toBe('order');
  expect(within(topic).getByRole('option', { name: 'Returns & refunds' })).toBeInTheDocument();
  const picked = screen.getByRole('combobox', { name: /Order/ }) as HTMLSelectElement;
  expect(picked.value).toBe('ORD-2');
  expect(within(picked).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not about an order', expect.stringContaining('Desk Lamp and 1 more'), expect.stringContaining('Kettle')]);
  expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveAttribute('maxlength', '120');
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('minlength', '10');
  expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
});

it('ignores an order that isn’t the shopper’s, and explains a rejected form', async () => {
  state.orders = [order()];
  await contact({ order: 'ORD-9', error: 'invalid_subject' });
  expect((screen.getByRole('combobox', { name: /Order/ }) as HTMLSelectElement).value).toBe('');
  expect((screen.getByRole('combobox', { name: 'What’s it about?' }) as HTMLSelectElement).value).toBe('');
  expect(screen.getByText('Add a subject of 3 to 120 characters, on one line.')).toBeInTheDocument();
  cleanup();
  await contact({ error: 'order_not_found' });
  expect(screen.getByRole('alert')).not.toHaveTextContent('Something went wrong');
});

it('holds back the form at five open cases', async () => {
  state.cases = [1, 2, 3, 4, 5].map((n) => supportCase({ id: `c${n}`, status: n === 5 ? 'answered' : 'open' }));
  await contact();
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  expect(screen.getByText(/You already have 5 open cases/)).toBeInTheDocument();
  cleanup();
  state.cases = [...(state.cases as SupportCase[]).slice(1), supportCase({ id: 'c6', status: 'closed' })];
  await contact();
  expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
});

it('lists the shopper’s cases, or says there are none', async () => {
  render(await SupportCasesPage());
  expect(screen.getByText('No support cases yet.')).toBeInTheDocument();
  cleanup();

  state.store = amazonIn;
  state.cases = [supportCase({ status: 'answered', orderId: 'ORD-1' }), supportCase({ id: 'c2', subject: 'Change my email', topic: 'account', status: 'closed' })];
  render(await SupportCasesPage());
  const first = screen.getByRole('link', { name: /Parcel never came/ });
  expect(first).toHaveAttribute('href', `/in/customer-service/cases/${ID}`);
  expect(screen.getByText('We replied')).toBeInTheDocument();
  expect(screen.getByText('Closed')).toBeInTheDocument();
  expect(screen.getByText(/Your account/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/in/customer-service/contact');
});

it('shows a case’s thread with a reply box and close, reading only the shopper’s own', async () => {
  state.thread = thread({ orderId: 'ORD-1', status: 'answered' });
  await caseView({ done: 'opened' });
  expect(state.getCase).toEqual([['US', ID, 'u1']]);
  expect(screen.getByRole('heading', { name: 'Parcel never came' })).toBeInTheDocument();
  expect(screen.getByText('We replied')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Order ORD-1/ })).toHaveAttribute('href', '/orders/ORD-1');
  expect(screen.getByText(/we’ve got your message/)).toBeInTheDocument();
  const messages = within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('listitem');
  expect(messages.map((m) => m.getAttribute('aria-label')?.split(',')[0])).toEqual(['You', 'Store support']);
  expect(messages[1]).toHaveTextContent('We have asked the carrier.');
  expect(screen.getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close case' })).toBeInTheDocument();
});

it('lets a closed case be read but not replied to', async () => {
  state.thread = thread({ status: 'closed', closedAt: '2026-10-04T12:00:00Z', orderId: 'ORD-1' });
  await caseView({ error: 'case_closed' });
  expect(screen.queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close case' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Contact us again' })).toHaveAttribute('href', '/customer-service/contact?order=ORD-1');
  expect(screen.getByText('This case is closed. Contact us again to open a new one.')).toBeInTheDocument();
});

it('is not found for someone else’s case', async () => {
  state.thread = null;
  await expect(SupportCasePage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) })).rejects.toThrow('NOT_FOUND');
  expect(state.seen).toEqual([]);
});

it('marks cases the store has replied on since the shopper looked', async () => {
  state.cases = [supportCase({ status: 'answered' }), supportCase({ id: 'c2', subject: 'Change my email', topic: 'account', status: 'open' })];
  state.unread = [ID];
  render(await SupportCasesPage());
  expect(screen.getByRole('link', { name: /Parcel never came\s*\(new reply\)/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Change my email/ }).textContent).not.toContain('New reply');
  expect(screen.getAllByText('New reply')).toHaveLength(1);
  expect(screen.getByText('We’ve replied on 1 case since you last looked.')).toBeInTheDocument();
  cleanup();

  state.unread = [];
  render(await SupportCasesPage());
  expect(screen.queryByText('New reply')).not.toBeInTheDocument();
  expect(screen.queryByText(/since you last looked/)).not.toBeInTheDocument();
});

it('opening a case marks its replies seen', async () => {
  state.thread = thread({ status: 'answered' });
  await caseView();
  expect(state.seen).toEqual([ID]);
});

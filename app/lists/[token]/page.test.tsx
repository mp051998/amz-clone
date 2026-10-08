import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { SharedList } from '@/lib/data/collections';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({ store: null as unknown, list: null as unknown, user: null as unknown, marks: [] as unknown[][] }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/collections', () => ({ getSharedList: async () => state.list }));
vi.mock('@/app/collections/actions', () => ({ addToCartQuiet: async () => ({ ok: true, count: 1 }) }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/app/actions/collections', () => ({
  markGiftBought: async (...a: unknown[]) => { state.marks.push(a); return { ok: true }; },
}));

import SharedListPage, { generateMetadata } from './page';

const TOKEN = 'a'.repeat(32);
const page = async () => render(await SharedListPage({ params: Promise.resolve({ token: TOKEN }) }));
const list = (over: Partial<SharedList> = {}): SharedList => ({
  token: TOKEN, name: 'Wedding registry', kind: 'custom', market: 'US', ownerName: 'Asha', sharedAt: '2026-10-05T10:00:00Z',
  mine: false, collectionId: null, products: [product(), product({ id: 'p2', title: 'Kettle', stock: 0, listMinor: 12999 })], bought: {}, details: {}, ...over,
});

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.list = list();
  state.user = { id: 'u2', name: 'Ravi', email: 'ravi@example.com' };
  state.marks = [];
});

it('shows the list, who shared it and an add-to-cart for each product', async () => {
  await page();
  expect(screen.getByRole('heading', { level: 1, name: 'Wedding registry' })).toBeTruthy();
  expect(screen.getByText('Shared by Asha · 2 items')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add Acme Wireless Headphones, 40h battery to cart' })).toHaveProperty('disabled', false);
  expect(screen.getByRole('button', { name: 'Add Kettle to cart' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('link', { name: 'Kettle' })).toHaveAttribute('href', '/product/p2');
  expect(screen.queryByText(/This is your list/)).toBeNull();
});

it('shows the sharer’s comment, quantity and priority on an item', async () => {
  state.list = list({ details: { p2: { comment: 'The blue one, please', quantity: 2, priority: 'highest' } } });
  await page();
  expect(screen.getByText('“The blue one, please”')).toBeTruthy();
  expect(screen.getByText('Priority:').nextElementSibling?.textContent).toBe('Highest');
  expect(screen.getByText('Quantity:').nextElementSibling?.textContent).toBe('2');
  // only one item says anything
  expect(screen.getAllByText('Priority:')).toHaveLength(1);
});

it('tells the sharer it’s theirs, with a way back to manage it', async () => {
  state.list = list({ mine: true, collectionId: 'c1' });
  await page();
  expect(screen.getByText(/This is your list/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Manage it in Collections' })).toHaveAttribute('href', '/collections?c=c1');
  // the sharer never sees gift marks, nor a way to make them
  expect(screen.queryByRole('button', { name: /as bought/ })).toBeNull();
  expect(screen.queryByText(/won’t see what’s marked/)).toBeNull();
});

it('lets a gift giver mark an item bought', async () => {
  await page();
  expect(screen.getByText(/Mark it so no one buys it twice\. Asha won’t see what’s marked\./)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mark Kettle as bought' }));
  await waitFor(() => expect(state.marks).toEqual([[TOKEN, 'p2', true]]));
});

it('shows what givers have bought, with an undo for the viewer’s own', async () => {
  state.list = list({ bought: { p2: 'someone', p1: 'you' } });
  await page();
  expect(screen.getByText('Shared by Asha · 2 items · 2 bought')).toBeTruthy();
  expect(screen.getByText('Bought by another gift giver')).toBeTruthy();
  expect(screen.getByText('✓ You bought this')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /as bought/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Undo: you bought Acme Wireless Headphones, 40h battery' }));
  await waitFor(() => expect(state.marks).toEqual([[TOKEN, 'p1', false]]));
});

it('asks signed-out visitors to sign in before marking', async () => {
  state.user = null;
  await page();
  expect(screen.getAllByRole('link', { name: 'Sign in to mark it bought' })[0]).toHaveAttribute('href', `/signin?next=${encodeURIComponent(`/lists/${TOKEN}`)}`);
  expect(screen.queryByRole('button', { name: /as bought/ })).toBeNull();
});

it('is a 404 when the link is off, and opens in the list’s own store', async () => {
  state.list = null;
  await expect(page()).rejects.toThrow('NOT_FOUND');
  state.list = list({ market: 'IN' });
  await expect(page()).rejects.toThrow(`REDIRECT /in/lists/${TOKEN}`);
  state.store = amazonIn;
  await page();
  expect(screen.getByText('Shared by Asha · 2 items')).toBeTruthy();
});

it('says when the list is empty and is never indexed', async () => {
  state.list = list({ products: [] });
  await page();
  expect(screen.getByText('Nothing on this list yet.')).toBeTruthy();
  const meta = await generateMetadata({ params: Promise.resolve({ token: TOKEN }) });
  expect(meta.robots).toEqual({ index: false, follow: false });
  expect(meta.title).toBe('Wedding registry · Shared list · Store');
});

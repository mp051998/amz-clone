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
vi.mock('@/lib/data/collections', async (orig) => ({ giftsLeft: (await orig<typeof import('@/lib/data/collections')>()).giftsLeft, getSharedList: async () => state.list }));
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
  mine: false, collectionId: null, products: [product(), product({ id: 'p2', title: 'Kettle', stock: 0, listMinor: 12999 })], bought: {}, gifts: {}, details: {}, ...over,
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
  // to a gift giver, the quantity is what it needs
  expect(screen.getByText('Needs:').nextElementSibling?.textContent).toBe('2');
  expect(screen.getByText('Has:').nextElementSibling?.textContent).toBe('0');
  // only one item says anything
  expect(screen.getAllByText('Priority:')).toHaveLength(1);
});

it('sorts by priority or price, still-to-buy items first', async () => {
  const p3 = product({ id: 'p3', title: 'Toaster', priceMinor: 500 });
  state.list = list({
    products: [product(), product({ id: 'p2', title: 'Kettle', stock: 0, listMinor: 12999 }), p3],
    bought: { p3: 'someone' },
    gifts: { p3: { has: 1, yours: 0 } },
    details: { p2: { comment: '', quantity: 1, priority: 'high' } },
  });
  const titles = () => screen.getAllByRole('listitem').map((li) => li.querySelector('a + a')?.textContent);
  render(await SharedListPage({ params: Promise.resolve({ token: TOKEN }), searchParams: Promise.resolve({ sort: 'priority' }) }));
  expect(titles()).toEqual(['Kettle', 'Acme Wireless Headphones, 40h battery', 'Toaster']);
  const nav = screen.getByRole('navigation', { name: 'Sort this list' });
  expect(nav.querySelector('[aria-current="true"]')?.textContent).toBe('Priority');
  expect(screen.getByRole('link', { name: 'Date added' })).toHaveAttribute('href', `/lists/${TOKEN}`);
  expect(screen.getByRole('link', { name: 'Price: low to high' })).toHaveAttribute('href', `/lists/${TOKEN}?sort=price-asc`);
  cleanup();
  render(await SharedListPage({ params: Promise.resolve({ token: TOKEN }), searchParams: Promise.resolve({ sort: 'price-asc' }) }));
  // the bought toaster stays last, cheapest or not
  expect(titles().at(-1)).toBe('Toaster');
});

it('tells the sharer it’s theirs, with a way back to manage it', async () => {
  state.list = list({ mine: true, collectionId: 'c1', details: { p2: { comment: '', quantity: 3, priority: 'medium' } } });
  await page();
  expect(screen.getByText('Quantity:').nextElementSibling?.textContent).toBe('3');
  expect(screen.queryByText('Has:')).toBeNull();
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
  await waitFor(() => expect(state.marks).toEqual([[TOKEN, 'p2', true, undefined]]));
});

it('shows what givers have bought, with an undo for the viewer’s own', async () => {
  state.list = list({ bought: { p2: 'someone', p1: 'you' }, gifts: { p2: { has: 1, yours: 0 }, p1: { has: 1, yours: 1 } } });
  await page();
  expect(screen.getByText('Shared by Asha · 2 items · 2 bought')).toBeTruthy();
  expect(screen.getByText('Bought by another gift giver')).toBeTruthy();
  expect(screen.getByText('✓ You bought this')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /as bought/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Undo: you bought Acme Wireless Headphones, 40h battery' }));
  await waitFor(() => expect(state.marks).toEqual([[TOKEN, 'p1', false, undefined]]));
});

it('shows what an item needs and has, and lets a giver mark how many they bought', async () => {
  const p3 = product({ id: 'p3', title: 'Plates' });
  state.list = list({
    products: [product(), product({ id: 'p2', title: 'Kettle', stock: 0, listMinor: 12999 }), p3],
    bought: { p2: 'someone' },
    gifts: { p1: { has: 1, yours: 0 }, p2: { has: 2, yours: 0 } },
    details: { p1: { comment: '', quantity: 4, priority: 'medium' }, p2: { comment: '', quantity: 2, priority: 'medium' } },
  });
  await page();
  // the kettle's two are covered, so it's bought and goes last; the headphones still need 3
  expect(screen.getByText('Shared by Asha · 3 items · 1 bought')).toBeTruthy();
  const items = screen.getAllByRole('listitem');
  expect(items.at(-1)?.textContent).toContain('Kettle');
  expect(items.at(-1)?.textContent).toContain('Bought by other gift givers');
  expect(screen.getAllByText('Needs:').map((dt) => dt.nextElementSibling?.textContent)).toEqual(['4', '2']);
  expect(screen.getAllByText('Has:').map((dt) => dt.nextElementSibling?.textContent)).toEqual(['1', '2']);
  const form = screen.getByRole('form', { name: 'Mark how many Acme Wireless Headphones, 40h battery you bought' });
  const select = form.querySelector('select')!;
  expect([...select.options].map((o) => o.value)).toEqual(['1', '2', '3']);
  fireEvent.change(select, { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mark Acme Wireless Headphones, 40h battery as bought' }));
  await waitFor(() => expect(state.marks).toEqual([[TOKEN, 'p1', true, 2]]));
  // asked for once: one click, as before
  fireEvent.click(screen.getByRole('button', { name: 'Mark Plates as bought' }));
  await waitFor(() => expect(state.marks.at(-1)).toEqual([TOKEN, 'p3', true, undefined]));
});

it('shows a giver how many they marked, with an undo', async () => {
  state.list = list({
    bought: { p1: 'you' },
    gifts: { p1: { has: 3, yours: 2 } },
    details: { p1: { comment: '', quantity: 5, priority: 'medium' } },
  });
  await page();
  expect(screen.getByText('✓ You bought 2')).toBeTruthy();
  expect(screen.getByText('Has:').nextElementSibling?.textContent).toBe('3');
  // still needs 2, so it isn't counted as bought
  expect(screen.getByText('Shared by Asha · 2 items')).toBeTruthy();
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

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { SharedList } from '@/lib/data/collections';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({ store: null as unknown, list: null as unknown }));

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

import SharedListPage, { generateMetadata } from './page';

const TOKEN = 'a'.repeat(32);
const page = async () => render(await SharedListPage({ params: Promise.resolve({ token: TOKEN }) }));
const list = (over: Partial<SharedList> = {}): SharedList => ({
  token: TOKEN, name: 'Wedding registry', kind: 'custom', market: 'US', ownerName: 'Asha', sharedAt: '2026-10-05T10:00:00Z',
  mine: false, collectionId: null, products: [product(), product({ id: 'p2', title: 'Kettle', stock: 0, listMinor: 12999 })], ...over,
});

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.list = list();
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

it('tells the sharer it’s theirs, with a way back to manage it', async () => {
  state.list = list({ mine: true, collectionId: 'c1' });
  await page();
  expect(screen.getByText(/This is your list/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Manage it in Collections' })).toHaveAttribute('href', '/collections?c=c1');
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

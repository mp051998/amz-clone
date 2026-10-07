import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({ profile: null as unknown, products: [] as unknown[], asked: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => amazon }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/components/deals/viewerSaved', () => ({ viewerSavedIds: async () => new Set<string>() }));
vi.mock('@/lib/data/catalog', () => ({
  listProducts: async (_db: unknown, market: string, opts: unknown) => (state.asked.push([market, opts]), state.products),
}));
vi.mock('@/lib/data/seller-feedback', async (original) => ({
  ...(await original<typeof import('@/lib/data/seller-feedback')>()),
  sellerProfile: async () => state.profile,
}));

import SellerPage from './page';

const show = async (name?: string) => render(await SellerPage({ searchParams: Promise.resolve(name === undefined ? {} : { name }) }));

afterEach(cleanup);
beforeEach(() => {
  state.profile = {
    seller: 'Kettle Co',
    periods: [
      { period: '30d', ratings: 0, positive: 0, neutral: 0, negative: 0 },
      { period: '90d', ratings: 0, positive: 0, neutral: 0, negative: 0 },
      { period: '12m', ratings: 0, positive: 0, neutral: 0, negative: 0 },
      { period: 'all', ratings: 0, positive: 0, neutral: 0, negative: 0 },
    ],
    stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    recent: [],
  };
  state.products = [product({ id: 'kettle', title: 'Electric Kettle 1.7L', seller: 'Kettle Co' })];
  state.asked = [];
});

it("shows the seller's ratings and what they sell in this store", async () => {
  await show('  Kettle Co ');
  expect(screen.getByRole('heading', { level: 1, name: 'Kettle Co' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Seller ratings' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Products from Kettle Co' })).toBeInTheDocument();
  expect(screen.getByText('Electric Kettle 1.7L')).toBeInTheDocument();
  expect(state.asked).toEqual([['US', { seller: 'Kettle Co', order: 'popular', limit: 40 }]]);
  // search narrowed to them, with its filters and sorts
  expect(screen.getByRole('link', { name: 'Search all their products' })).toHaveAttribute('href', '/s?seller=Kettle%20Co');
});

it('says so when nothing of theirs is on sale', async () => {
  state.products = [];
  await show('Kettle Co');
  expect(screen.getByText('Nothing from this seller is on sale here right now.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Search all their products' })).toBeNull();
});

it('is not found without a name, or for a seller the store does not know', async () => {
  await expect(show()).rejects.toThrow('NOT_FOUND');
  await expect(show('   ')).rejects.toThrow('NOT_FOUND');
  state.profile = null;
  await expect(show('Nobody')).rejects.toThrow('NOT_FOUND');
});

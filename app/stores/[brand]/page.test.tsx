import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({ products: [] as unknown[], asked: [] as unknown[], user: null as unknown, following: false, followAsked: [] as unknown[], smallBusiness: null as unknown }));

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
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/data/brand-follows', () => ({
  isFollowingBrand: async (_db: unknown, ...args: unknown[]) => (state.followAsked.push(args), state.following),
}));
vi.mock('@/lib/data/small-businesses', () => ({ getSmallBusiness: async () => state.smallBusiness }));
vi.mock('@/app/actions/brands', () => ({ setBrandFollowed: async () => {} }));
vi.mock('@/lib/data/catalog', () => ({
  listProducts: async (_db: unknown, market: string, opts: unknown) => (state.asked.push([market, opts]), state.products),
}));

import BrandStorePage, { generateMetadata } from './page';

const show = async (brand: string, sp: { follow_error?: string } = {}) =>
  render(await BrandStorePage({ params: Promise.resolve({ brand }), searchParams: Promise.resolve(sp) }));
const field = (form: HTMLElement, name: string) => (form.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;
const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement;

afterEach(cleanup);
beforeEach(() => {
  state.products = [
    product({ id: 'hp', title: 'Acme Audio Headphones', brand: 'Acme Audio', category: 'electronics', categoryName: 'Electronics', deal: true, dealPct: 20 }),
    product({ id: 'sp', title: 'Acme Audio Speaker', brand: 'Acme Audio', category: 'electronics', categoryName: 'Electronics' }),
    product({ id: 'mug', title: 'Acme Audio Mug', brand: 'Acme Audio', category: 'home-kitchen', categoryName: 'Home & Kitchen' }),
  ];
  state.asked = [];
  state.user = null;
  state.following = false;
  state.followAsked = [];
});

it("shows the brand's best sellers, deals and departments", async () => {
  await show('Acme%20Audio');
  expect(screen.getByRole('heading', { level: 1, name: 'Acme Audio' })).toBeInTheDocument();
  expect(screen.getByText('3 products from Acme Audio in this store, across 2 departments.')).toBeInTheDocument();
  expect(state.asked).toEqual([['US', { brand: 'Acme Audio', order: 'popular', limit: 200 }]]);

  const best = section('Best Sellers');
  expect(within(best).getAllByRole('article')).toHaveLength(3);
  const deals = section('Deals');
  expect(within(deals).getByText('Acme Audio Headphones')).toBeInTheDocument();
  expect(within(section('Home & Kitchen')).getByText('Acme Audio Mug')).toBeInTheDocument();
  expect(within(section('Electronics')).queryByText('Acme Audio Mug')).toBeNull();

  // jump to each section
  const nav = screen.getByRole('navigation', { name: 'Acme Audio store' });
  expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#best-sellers', '#deals', '#dept-electronics', '#dept-home-kitchen']);
  // search narrowed to the brand, with its filters and sorts
  expect(screen.getByRole('link', { name: 'Search all Acme Audio' })).toHaveAttribute('href', '/s?brand=Acme%20Audio');
});

it('links to the rest of a section it cuts short', async () => {
  state.products = Array.from({ length: 10 }, (_, i) => product({ id: `p${i}`, title: `Gadget ${i}`, brand: 'Acme Audio', category: i < 9 ? 'electronics' : 'toys', categoryName: i < 9 ? 'Electronics' : 'Toys' }));
  await show('Acme Audio');
  expect(within(section('Best Sellers')).getAllByRole('article')).toHaveLength(8);
  expect(screen.getByRole('link', { name: 'See all 10' })).toHaveAttribute('href', '/s?brand=Acme%20Audio');
  expect(screen.getByRole('link', { name: 'See all 9' })).toHaveAttribute('href', '/s?brand=Acme%20Audio&dept=electronics');
  // a department shown whole needs no link
  expect(screen.queryByRole('link', { name: 'See all 1' })).toBeNull();
});

it('shows a one-department brand as its best sellers alone', async () => {
  state.products = [product({ id: 'a', title: 'Only Thing', brand: 'Acme Audio' })];
  await show('Acme Audio');
  expect(screen.getByText('One product from Acme Audio in this store.')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Acme Audio store' })).toBeNull();
  expect(screen.queryByRole('heading', { level: 2, name: 'Electronics' })).toBeNull();
  expect(screen.queryByRole('heading', { level: 2, name: 'Deals' })).toBeNull();
  expect(screen.getAllByText('Only Thing')).toHaveLength(1);
});

it('offers to follow the brand, signed out too (sign-in comes first)', async () => {
  await show('Acme%20Audio');
  const follow = screen.getByRole('button', { name: 'Follow', pressed: false });
  const form = follow.closest('form') as HTMLElement;
  expect([field(form, 'brand'), field(form, 'follow'), field(form, 'next')]).toEqual(['Acme Audio', '1', '/stores/Acme%20Audio']);
  expect(state.followAsked).toEqual([]);
  expect(screen.queryByRole('link', { name: 'Brands you follow' })).toBeNull();
});

it('shows a followed brand as Following, which unfollows it', async () => {
  state.user = { id: 'u1', email: 'a@b.test' };
  state.following = true;
  await show('Acme Audio');
  expect(state.followAsked).toEqual([['US', 'u1', 'Acme Audio']]);
  const following = screen.getByRole('button', { name: 'Following', pressed: true });
  expect(field(following.closest('form') as HTMLElement, 'follow')).toBe('0');
  expect(screen.getByText(/You follow Acme Audio: see what’s new from it in/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Brands you follow' })).toHaveAttribute('href', '/account/brands');
});

it('says when following didn’t work', async () => {
  await show('Acme Audio', { follow_error: 'not_found' });
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing from Acme Audio is on sale in this store to follow.');
});

it('is not found for a brand with nothing on sale here', async () => {
  state.products = [];
  await expect(show('Nobody')).rejects.toThrow('NOT_FOUND');
  await expect(show('%20')).rejects.toThrow('NOT_FOUND');
});

it('names the brand in the title, even with a stray %', async () => {
  expect((await generateMetadata({ params: Promise.resolve({ brand: 'Acme%20Audio' }) })).title).toBe('Acme Audio Store · Store');
  expect((await generateMetadata({ params: Promise.resolve({ brand: '100%' }) })).title).toBe('100% Store · Store');
});

it('says when the brand is a small business, with what it makes', async () => {
  state.smallBusiness = { brand: 'Acme Audio', story: 'Speakers and headphones.' };
  try {
    await show('Acme Audio');
    expect(screen.getByText('Small Business')).toBeInTheDocument();
    expect(screen.getByText(/Acme Audio is a small business brand\. Speakers and headphones\./)).toBeInTheDocument();
  } finally {
    state.smallBusiness = null;
  }
});

it('says nothing of it otherwise', async () => {
  await show('Acme Audio');
  expect(screen.queryByText('Small Business')).toBeNull();
});

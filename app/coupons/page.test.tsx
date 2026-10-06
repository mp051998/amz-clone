import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { CouponOffer } from '@/lib/data/coupons';
import { CATEGORIES, product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({ store: null as unknown, user: null as unknown, offers: [] as CouponOffer[] }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/components/decision/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/storefront', () => ({ storeCategories: async () => CATEGORIES }));
vi.mock('@/app/actions/coupons', () => ({ setCouponClipped: async () => ({ clipped: true }) }));
vi.mock('@/lib/data/coupons', async (orig) => ({
  ...(await orig<typeof import('@/lib/data/coupons')>()),
  listCouponOffers: async () => state.offers,
}));

import CouponsPage from './page';

const page = async (sp: { c?: string; applied?: string } = {}) => render(await CouponsPage({ searchParams: Promise.resolve(sp) }));
const asha = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
const headphones = { product: product({ id: 'h1', title: 'Acme Headphones', priceMinor: 3000 }), percentOff: 20, clipped: false };
const book = { product: product({ id: 'b1', title: 'A Good Book', category: 'books', categoryName: 'Books', priceMinor: 1999 }), percentOff: 10, clipped: true };

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = null;
  state.offers = [headphones, book];
});

it('lists every coupon with its saving, and asks signed-out shoppers to sign in', async () => {
  // signed out, nothing reads as applied
  state.offers = [headphones, { ...book, clipped: false }];
  await page();
  expect(screen.getByRole('heading', { name: 'Coupons' })).toBeInTheDocument();
  const cards = screen.getAllByRole('article');
  expect(cards).toHaveLength(2);
  expect(within(cards[0]).getByText('Save 20%')).toBeInTheDocument();
  expect(within(cards[0]).getByText('Save $6.00 each')).toBeInTheDocument();
  expect(within(cards[1]).getByText('Save $2.00 each')).toBeInTheDocument();
  expect(within(cards[1]).getByLabelText('Apply 10% coupon')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin?next=/coupons');
  expect(screen.getByRole('link', { name: 'Books' })).toHaveAttribute('href', '/coupons?c=books');
  expect(screen.queryByRole('link', { name: /Applied/ })).toBeNull();
});

it('filters by department and by the coupons a shopper applied', async () => {
  state.user = asha;
  await page({ c: 'books' });
  expect(screen.getByRole('heading', { name: 'Coupons in Books' })).toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByLabelText('10% coupon applied')).toBeChecked();
  expect(screen.getByRole('link', { name: /Applied/ })).toHaveAttribute('href', '/coupons?c=books&applied=1');
  cleanup();

  await page({ applied: '1' });
  expect(screen.getAllByRole('article').map((a) => within(a).getByRole('link', { name: /Book|Headphones/ }).textContent)).toEqual(['A Good Book']);
});

it('says when there are none, in the India store too', async () => {
  state.store = amazonIn;
  state.offers = [];
  await page();
  expect(screen.getByText('No coupons right now')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'See today’s deals' })).toHaveAttribute('href', '/in/deals');
});

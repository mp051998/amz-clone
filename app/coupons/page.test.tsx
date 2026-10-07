import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { CouponOffer } from '@/lib/data/coupons';
import type { PromoOffer } from '@/lib/data/promo';
import { CATEGORIES, product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({ store: null as unknown, user: null as unknown, offers: [] as CouponOffer[], promos: [] as PromoOffer[] }));

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
vi.mock('@/lib/data/promo', () => ({ activePromoCodes: async () => state.promos }));

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
  state.promos = [];
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

it('lists the promotion codes the store is running, but not under Applied', async () => {
  state.promos = [
    { code: 'HOME15', percentOff: 15, description: '15% off home & kitchen', category: { slug: 'home-kitchen', name: 'Home & Kitchen' }, minSpendMinor: 2500, endsAt: '2026-10-31T12:00:00Z' },
    { code: 'SAVE10', percentOff: 10, description: '10% off your order', minSpendMinor: 0 },
  ];
  await page();
  const section = screen.getByRole('region', { name: 'Promotion codes' });
  const items = within(section).getAllByRole('listitem');
  expect(items.map((li) => li.textContent)).toEqual([
    'HOME1515% off15% off home & kitchenHome & Kitchen only · Spend $25.00+ · Ends Oct 31',
    'SAVE1010% off10% off your orderEverything in the store',
  ]);
  cleanup();

  state.user = asha;
  await page({ applied: '1' });
  expect(screen.queryByRole('region', { name: 'Promotion codes' })).toBeNull();
});

it('leaves the promotions out when the store runs none', async () => {
  await page();
  expect(screen.queryByText('Promotion codes')).toBeNull();
});

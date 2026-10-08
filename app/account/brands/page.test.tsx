import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({ store: null as unknown, user: null as unknown, feed: [] as unknown[], asked: [] as unknown[] }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/components/deals/viewerSaved', () => ({ viewerSavedIds: async () => new Set<string>() }));
vi.mock('@/app/actions/brands', () => ({ setBrandFollowed: async () => {} }));
vi.mock('@/lib/data/brand-follows', () => ({
  followedBrandFeed: async (_db: unknown, ...args: unknown[]) => (state.asked.push(args), state.feed),
}));

import BrandsYouFollowPage from './page';

const show = async (sp: { follow_error?: string } = {}) => render(await BrandsYouFollowPage({ searchParams: Promise.resolve(sp) }));
const field = (form: HTMLElement, name: string) => (form.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', email: 'a@b.test' };
  state.asked = [];
  state.feed = [
    {
      brand: 'Acme Audio',
      followedAt: '2026-10-01T18:00:00Z',
      products: [product({ id: 'hp', title: 'Acme Audio Headphones', brand: 'Acme Audio' }), product({ id: 'sp', title: 'Acme Audio Speaker', brand: 'Acme Audio' })],
    },
    { brand: 'Gone Co', followedAt: '2026-09-01T18:00:00Z', products: [] },
  ];
});

it('shows what’s new from each brand followed, with its store and Following to unfollow', async () => {
  await show();
  expect(state.asked).toEqual([['US', 'u1']]);
  expect(screen.getByRole('heading', { level: 1, name: 'Brands you follow' })).toBeInTheDocument();

  const acme = screen.getByRole('region', { name: 'Acme Audio' });
  expect(within(acme).getByRole('heading', { level: 2, name: 'Acme Audio' }).querySelector('a')).toHaveAttribute('href', '/stores/Acme%20Audio');
  expect(within(acme).getByText('Following since October 1, 2026')).toBeInTheDocument();
  expect(within(acme).getAllByRole('article')).toHaveLength(2);
  expect(within(acme).getByRole('link', { name: 'Visit the store' })).toHaveAttribute('href', '/stores/Acme%20Audio');
  const following = within(acme).getByRole('button', { name: 'Following', pressed: true });
  const form = following.closest('form') as HTMLElement;
  expect([field(form, 'brand'), field(form, 'follow'), field(form, 'next')]).toEqual(['Acme Audio', '0', '/account/brands']);

  const gone = screen.getByRole('region', { name: 'Gone Co' });
  expect(within(gone).getByText('Nothing from Gone Co is on sale here right now.')).toBeInTheDocument();
});

it('says how to follow one when there are none (India store paths)', async () => {
  state.store = amazonIn;
  state.feed = [];
  await show();
  expect(screen.getByText('You don’t follow any brands yet')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Best Sellers' })).toHaveAttribute('href', '/in/bestsellers');
  expect(screen.getByRole('link', { name: '← Account' })).toHaveAttribute('href', '/in/account');
});

it('says when unfollowing didn’t work', async () => {
  await show({ follow_error: 'internal' });
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t change that. Please try again.');
});

it('sends the signed-out to sign in', async () => {
  state.user = null;
  await expect(show()).rejects.toThrow('REDIRECT /signin?next=/account/brands');
});

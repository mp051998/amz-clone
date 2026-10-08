import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { RenewedOffer } from '@/lib/data/renewed';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({ store: null as unknown, items: [] as RenewedOffer[] }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('@/components/decision/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/app/actions/cart', () => ({ addToCart: async () => {} }));
vi.mock('@/lib/data/renewed', () => ({ listRenewed: async () => state.items }));

import RenewedPage from './page';

const phone = product({ id: 'ph1', title: 'Pixel Phone 128GB', priceMinor: 39_900 });
const renewed = (over = {}): RenewedOffer => ({
  product: phone,
  offer: product({ id: 'ph1-o2', offerOf: 'ph1', condition: 'renewed', conditionNote: 'Battery at 90% or more.', priceMinor: 24_900, seller: 'Renew Co', ...over }),
});

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.items = [renewed()];
});

it('lists renewed offers against the new price, with the US Renewed Guarantee', async () => {
  render(await RenewedPage());
  expect(screen.getByRole('heading', { level: 1, name: 'Renewed' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '90-day Renewed Guarantee' })).toBeInTheDocument();
  expect(screen.getByText(/return it within 90 days of delivery for a refund or a replacement/)).toBeInTheDocument();
  const [card] = screen.getAllByRole('article');
  expect(within(card).getByRole('link', { name: 'Pixel Phone 128GB' })).toHaveAttribute('href', '/product/ph1/offers?condition=renewed');
  expect(within(card).getByText('Save 38%')).toBeInTheDocument();
  expect(within(card).getByText('New: $399.00')).toBeInTheDocument();
  expect(card.textContent).toContain('Renewed — Battery at 90% or more.');
  expect(card.textContent).toContain('Sold by Renew Co');
  expect(card.textContent).toContain('90-day Renewed Guarantee');
  const add = within(card).getByRole('button', { name: 'Add to cart: Pixel Phone 128GB, Renewed from Renew Co' });
  expect(add.closest('form')?.querySelector('input[name="id"]')).toHaveAttribute('value', 'ph1-o2');
});

it('words India’s returns by category, with no guarantee', async () => {
  state.store = amazonIn;
  state.items = [renewed({ priceMinor: 39_900 })];
  render(await RenewedPage());
  expect(screen.queryByText(/Renewed Guarantee/)).toBeNull();
  expect(screen.getByText(/within its category’s return window/)).toBeInTheDocument();
  const [card] = screen.getAllByRole('article');
  // no cheaper than new: no saving
  expect(within(card).queryByText(/^Save/)).toBeNull();
  expect(within(card).getByRole('link', { name: 'Pixel Phone 128GB' })).toHaveAttribute('href', '/in/product/ph1/offers?condition=renewed');
});

it('says when there are none', async () => {
  state.items = [];
  render(await RenewedPage());
  expect(screen.getByText('No renewed offers right now')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'See today’s deals' })).toHaveAttribute('href', '/deals');
});

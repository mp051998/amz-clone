import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { HELP_TOPIC_SLUGS, helpTopics } from '@/lib/help-topics';

const state = vi.hoisted(() => ({ store: null as unknown }));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));

import HelpTopicPage, { generateMetadata } from './page';

const show = async (topic: string) => render(await HelpTopicPage({ params: Promise.resolve({ topic }) }));

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
});

it('answers the topic’s questions, with where to do it and the other topics', async () => {
  await show('returns-refunds');
  expect(screen.getByRole('heading', { level: 1, name: 'Returns, refunds & exchanges' })).toBeInTheDocument();
  expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/customer-service');
  expect(screen.getByText('How long do I have to return an item?')).toBeInTheDocument();
  expect(screen.getByText(/returned within 30 days of delivery, and Renewed items within 90 days/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Your orders' })).toHaveAttribute('href', '/orders');
  const others = screen.getByRole('heading', { name: 'Other help topics' }).closest('section')!;
  expect(within(others).queryByRole('link', { name: 'Returns, refunds & exchanges' })).toBeNull();
  expect(within(others).getByRole('link', { name: 'Shipping & delivery' })).toHaveAttribute('href', '/customer-service/help/shipping-delivery');
  expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/customer-service/contact');
  expect(await generateMetadata({ params: Promise.resolve({ topic: 'returns-refunds' }) })).toEqual({ title: 'Returns, refunds & exchanges · Help · Store' });
});

it('words answers for the store: its free-delivery threshold, return window and ways to pay', async () => {
  state.store = amazonIn;
  await show('shipping-delivery');
  expect(screen.getByText(/Orders over ₹499 are delivered free/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Your addresses' })).toHaveAttribute('href', '/in/account/addresses');
  cleanup();
  await show('returns-refunds');
  expect(screen.getByText(/returned within 10 days of delivery\./)).toBeInTheDocument();
  expect(screen.getByText(/schedule a pickup/)).toBeInTheDocument();
  cleanup();
  await show('payments');
  expect(screen.getByText(/UPI, a credit or debit card, net banking, or Pay on Delivery/)).toBeInTheDocument();
  cleanup();

  state.store = amazon;
  await show('shipping-delivery');
  expect(screen.getByText(/Orders over \$35\.00 are delivered free/)).toBeInTheDocument();
});

it('is not found for an unknown topic', async () => {
  await expect(show('nope')).rejects.toThrow('NOT_FOUND');
});

it('every topic links only to the store’s own pages', () => {
  for (const store of [amazon, amazonIn]) {
    // the same pages in both stores, as the sitemap lists them
    expect(helpTopics(store).map((t) => t.slug)).toEqual([...HELP_TOPIC_SLUGS]);
    for (const t of helpTopics(store)) {
      expect(t.articles.length).toBeGreaterThan(0);
      for (const l of t.links) expect(l.href).toMatch(/^\/[a-z]/);
    }
  }
});

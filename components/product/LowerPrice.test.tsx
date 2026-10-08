import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PriceReport } from '@/lib/lower-price';

const sent = vi.hoisted(() => ({ calls: [] as unknown[][], reply: null as unknown }));
vi.mock('@/app/actions/lower-price', () => ({
  tellLowerPrice: async (...args: unknown[]) => {
    sent.calls.push(args);
    return sent.reply;
  },
}));

import { LowerPrice, type LowerPriceProps } from './LowerPrice';

const report = (over: Partial<PriceReport> = {}): PriceReport => ({
  id: 'r1', productId: 'p1', ourPriceMinor: 9999, seenAt: 'online', url: 'https://www.example.com/kettle', storeName: null, city: null, seenOn: null,
  priceMinor: 7999, shippingMinor: 500, status: 'open', createdAt: '2026-10-02T12:00:00Z', updatedAt: '2026-10-02T12:00:00Z', reviewedAt: null, ...over,
});

const props = (over: Partial<LowerPriceProps> = {}): LowerPriceProps => ({
  productId: 'p1', priceMinor: 9999, currency: 'USD', signedIn: true, signinHref: '/signin?next=%2Fproduct%2Fp1%23lower-price', open: null, locale: 'en-US', timeZone: 'UTC', ...over,
});

const submit = async (name = 'Submit feedback') => act(async () => fireEvent.click(screen.getByRole('button', { name })));

beforeEach(() => {
  sent.calls = [];
  sent.reply = { ok: true, report: report(), updated: false };
});
afterEach(cleanup);

it('signed-out shoppers get a sign-in link back to it', () => {
  render(<LowerPrice {...props({ signedIn: false })} />);
  expect(screen.getByRole('link', { name: 'Sign in to tell us about a lower price' })).toHaveAttribute('href', '/signin?next=%2Fproduct%2Fp1%23lower-price');
});

it('asks where, then for the page, price and delivery, and sends it', async () => {
  render(<LowerPrice {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Would you like to tell us about a lower price?' }));
  expect(screen.getByText('$99.99')).toBeInTheDocument();
  await submit();
  expect(screen.getByRole('alert')).toHaveTextContent('Choose where you saw it');

  fireEvent.click(screen.getByRole('radio', { name: 'Website (online)' }));
  fireEvent.change(screen.getByLabelText('Web address (URL)'), { target: { value: 'https://www.example.com/kettle' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '99' } });
  fireEvent.change(screen.getByLabelText('Delivery cost'), { target: { value: '5' } });
  await submit();
  expect(screen.getByRole('alert')).toHaveTextContent('That isn’t lower than our price, with delivery.');
  expect(sent.calls).toEqual([]);

  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '79.99' } });
  await submit();
  expect(sent.calls).toEqual([['p1', { seenAt: 'online', priceMinor: 7999, shippingMinor: 500, url: 'https://www.example.com/kettle', store: '', city: '', seenOn: '' }]]);
  expect(screen.getByRole('status')).toHaveTextContent('Thanks for telling us.');
  expect(screen.getByRole('button', { name: 'Update the lower price you told us about' })).toBeInTheDocument();
});

it('in a shop asks for its name, town and the day instead', async () => {
  sent.reply = { ok: true, report: report({ seenAt: 'store', url: null, storeName: 'Best Buy', city: 'Austin', seenOn: '2026-10-06', shippingMinor: 0 }), updated: false };
  render(<LowerPrice {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Would you like to tell us about a lower price?' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Shop (offline)' }));
  expect(screen.queryByLabelText('Web address (URL)')).toBeNull();
  expect(screen.queryByLabelText('Delivery cost')).toBeNull();
  fireEvent.change(screen.getByLabelText('Shop name'), { target: { value: 'Best Buy' } });
  fireEvent.change(screen.getByLabelText(/Town or city/), { target: { value: 'Austin' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '79.99' } });
  await submit();
  expect(screen.getByRole('alert')).toHaveTextContent('Enter the day you saw it, within the last 30 days.');
  const date = screen.getByLabelText('Date of the price') as HTMLInputElement;
  const today = new Date().toISOString().slice(0, 10);
  expect(date.max).toBe(today);
  fireEvent.change(date, { target: { value: today } });
  await submit();
  expect(sent.calls).toEqual([['p1', { seenAt: 'store', priceMinor: 7999, shippingMinor: 0, url: '', store: 'Best Buy', city: 'Austin', seenOn: today }]]);
});

it('shows what the shopper told us and lets them change it, with the server’s refusal if any', async () => {
  sent.reply = { ok: false, code: 'invalid_input', message: 'That isn’t lower than our price.' };
  render(<LowerPrice {...props({ open: report() })} />);
  expect(screen.getByText('On October 2, 2026 you told us it was $84.99 at example.com.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Update the lower price you told us about' }));
  expect(screen.getByRole('radio', { name: 'Website (online)' })).toBeChecked();
  expect(screen.getByLabelText('Price')).toHaveValue('79.99');
  expect(screen.getByLabelText('Delivery cost')).toHaveValue('5.00');
  await submit('Update feedback');
  expect(screen.getByRole('alert')).toHaveTextContent('That isn’t lower than our price.');
});

it('takes whole rupees in India', async () => {
  render(<LowerPrice {...props({ currency: 'INR', priceMinor: 249_900, locale: 'en-IN', timeZone: 'Asia/Kolkata' })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Would you like to tell us about a lower price?' }));
  expect(screen.getByText('₹2,499')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Website (online)' }));
  fireEvent.change(screen.getByLabelText('Web address (URL)'), { target: { value: 'https://shop.example.in/p/1' } });
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '2,199' } });
  await submit();
  expect(sent.calls[0][1]).toMatchObject({ priceMinor: 219_900, shippingMinor: 0 });
});

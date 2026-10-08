import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { Product } from '@/lib/types';
import { OfferList, OtherSellers, type OfferItem } from './Offers';
import { offerItem, positiveText } from './offerItems';

vi.mock('@/app/actions/cart', () => ({ addToCart: async () => {} }));

afterEach(cleanup);

const offer = (o: Partial<OfferItem> = {}): OfferItem => ({
  id: 'p1-o1',
  priceText: '$9.49',
  condition: 'Used – Very Good',
  seller: 'Lumen Store',
  sellerHref: '/seller?name=Lumen%20Store',
  shipsFrom: 'Lumen Store',
  ...o,
});

const product = (o: Partial<Product> = {}) =>
  ({ id: 'p1-o1', seller: 'Lumen Store', shipsFrom: 'Amazon', offerOf: 'p1', condition: 'used_like_new', ...o }) as Product;

describe('offerItem', () => {
  it('words the condition and links the seller in the store', () => {
    const item = offerItem(product({ conditionNote: 'Minor scuffs on the case' }), {
      store: amazonIn,
      priceText: '₹949',
      rating: { ratings: 25, average: 4.5, positivePct: 92 },
      delivery: 'FREE delivery Tuesday, 13 October',
    });
    expect(item).toEqual({
      id: 'p1-o1',
      priceText: '₹949',
      condition: 'Used – Like New',
      note: 'Minor scuffs on the case',
      seller: 'Lumen Store',
      sellerHref: '/in/seller?name=Lumen%20Store',
      sellerRating: '92% positive (25 ratings)',
      shipsFrom: 'Amazon',
      delivery: 'FREE delivery Tuesday, 13 October',
    });
  });

  it('calls the product’s own offer New and Featured, sending sized ones to their page', () => {
    const item = offerItem(product({ id: 'p1', offerOf: undefined, condition: undefined, sizes: ['S', 'M'] }), { store: amazon, priceText: '$12', featured: true });
    expect(item).toMatchObject({ condition: 'New', featured: true, optionsHref: '/product/p1' });
    expect(item).not.toHaveProperty('sellerRating');
  });

  it('gives a renewed offer the store’s Renewed Guarantee, where there is one', () => {
    expect(offerItem(product({ condition: 'renewed' }), { store: amazon, priceText: '$9' }).guarantee).toEqual({ label: '90-day Renewed Guarantee', href: '/renewed' });
    expect(offerItem(product({ condition: 'renewed' }), { store: amazonIn, priceText: '₹9' })).not.toHaveProperty('guarantee');
    expect(offerItem(product(), { store: amazon, priceText: '$9' })).not.toHaveProperty('guarantee');
  });

  it('leaves out a seller with no ratings', () => {
    expect(offerItem(product(), { store: amazon, priceText: '$1', rating: { ratings: 0, average: 0, positivePct: 0 } })).not.toHaveProperty('sellerRating');
    expect(positiveText({ ratings: 1, average: 5, positivePct: 100 })).toBe('100% positive (1 rating)');
    expect(positiveText({ ratings: 1200, average: 4.1, positivePct: 88 })).toBe('88% positive (1,200 ratings)');
  });
});

describe('OtherSellers', () => {
  it('lists the cheapest offers with their own add to cart, and links every buying option', () => {
    render(
      <OtherSellers
        name="Verity"
        offers={[
          offer(),
          offer({ id: 'p1-o2', priceText: '$11.20', condition: 'New', seller: 'Marketplace Seller', sellerRating: '80% positive (5 ratings)' }),
          offer({ id: 'p1-o3', condition: 'Renewed', guarantee: { label: '90-day Renewed Guarantee', href: '/renewed' } }),
        ]}
        allHref="/product/p1/offers"
        allLabel="New & Used (4) from $9.49"
      />,
    );
    const box = screen.getByRole('region', { name: 'Other sellers on Amazon' });
    const rows = within(box).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[2].textContent).toContain('90-day Renewed Guarantee');
    expect(rows[0].textContent).toContain('$9.49');
    expect(rows[0].textContent).toContain('Used – Very Good');
    expect(within(rows[0]).getByRole('link', { name: 'Lumen Store' })).toHaveAttribute('href', '/seller?name=Lumen%20Store');
    expect(rows[1].textContent).toContain('80% positive (5 ratings)');
    const add = within(rows[0]).getByRole('button', { name: 'Add to cart: Verity, Used – Very Good from Lumen Store' });
    expect(add.closest('form')?.querySelector('input[name="id"]')).toHaveAttribute('value', 'p1-o1');
    expect(within(box).getByRole('link', { name: 'New & Used (4) from $9.49' })).toHaveAttribute('href', '/product/p1/offers');
  });
});

describe('OfferList', () => {
  it('shows each offer’s delivery, condition, note, ships from and seller, the featured one tagged', () => {
    render(
      <OfferList
        name="Verity"
        offers={[
          offer({ id: 'p1', priceText: '$17.99', condition: 'New', seller: 'Amazon.com', shipsFrom: 'Amazon', featured: true, delivery: 'FREE delivery Tuesday, October 13' }),
          offer({ note: 'Cover has light wear' }),
          offer({ id: 'p1-o3', condition: 'Renewed', guarantee: { label: '90-day Renewed Guarantee', href: '/renewed' } }),
        ]}
      />,
    );
    const [first, second, third] = screen.getAllByRole('listitem');
    expect(within(third).getByRole('link', { name: '90-day Renewed Guarantee' })).toHaveAttribute('href', '/renewed');
    expect(within(second).queryByRole('link', { name: /Renewed Guarantee/ })).toBeNull();
    expect(within(first).getByText('Featured offer')).toBeInTheDocument();
    expect(first.textContent).toContain('FREE delivery Tuesday, October 13');
    expect(first.textContent).toContain('Condition: New');
    expect(first.textContent).toContain('Ships from Amazon');
    expect(within(second).queryByText('Featured offer')).toBeNull();
    expect(second.textContent).toContain('Condition: Used – Very Good — Cover has light wear');
    expect(within(second).getByRole('button', { name: 'Add to cart: Verity, Used – Very Good from Lumen Store' })).toBeInTheDocument();
  });

  it('sends an offer that needs a size to its page', () => {
    render(<OfferList name="Tee" offers={[offer({ id: 'tee', condition: 'New', optionsHref: '/product/tee' })]} />);
    expect(screen.queryByRole('button', { name: /Add to cart/ })).toBeNull();
    expect(screen.getByRole('link', { name: /See options/ })).toHaveAttribute('href', '/product/tee');
  });
});

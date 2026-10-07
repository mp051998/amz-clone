import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Product } from '@/lib/types';
import { PriceChanges } from './PriceChanges';

afterEach(cleanup);

const product = (id: string, title: string): Product => ({
  id, market: 'US', title, category: 'c', categoryName: 'C', image: '', priceMinor: 0, rating: 4, reviewCount: 1,
  seller: 'S', shipsFrom: 'S', bullets: [], stock: 20, curBase: 'USD',
});
const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;
const sp = (path: string) => `/in${path}`;

it('says which prices went up and which came down, linking each product', () => {
  render(
    <PriceChanges
      changes={[
        { product: product('k', 'Kettle'), fromMinor: 2999, toMinor: 3499 },
        { product: product('m', 'Mug'), fromMinor: 1200, toMinor: 999 },
      ]}
      money={money}
      sp={sp}
    />,
  );
  const box = screen.getByRole('region', { name: 'Important messages about items in your cart' });
  const items = screen.getAllByRole('listitem');
  expect(items.map((li) => li.textContent)).toEqual([
    'The price of Kettle has increased from $29.99 to $34.99.',
    'The price of Mug has decreased from $12.00 to $9.99.',
  ]);
  expect(screen.getByRole('link', { name: 'Kettle' })).toHaveAttribute('href', '/in/product/k');
  expect(box).toBeInTheDocument();
});

it('shows nothing when no price changed', () => {
  const { container } = render(<PriceChanges changes={[]} money={money} sp={sp} />);
  expect(container).toBeEmptyDOMElement();
});

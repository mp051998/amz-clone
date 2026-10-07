import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { FrequentlyReturned, UsuallyKept } from './FrequentlyReturned';

afterEach(cleanup);

it('warns, gives the usual reason, and points to the reviews', () => {
  render(<FrequentlyReturned signal={{ reason: 'not_as_described' }} reviewsHref="#reviews" />);
  const note = screen.getByRole('note', { name: 'Frequently returned item' });
  expect(note).toHaveTextContent('Customers who return it usually say it wasn’t as described. Check the product details and customer reviews before you buy.');
  expect(screen.getByRole('link', { name: 'customer reviews' })).toHaveAttribute('href', '#reviews');
});

it('without a product-side reason, only the warning', () => {
  render(<FrequentlyReturned signal={{ reason: null }} reviewsHref="#reviews" />);
  expect(screen.getByRole('note')).toHaveTextContent(/^Frequently returned itemCheck the product details/);
});

it('says customers usually keep it', () => {
  render(<UsuallyKept />);
  expect(screen.getByRole('note', { name: 'Customers usually keep this item' })).toHaveTextContent('Customers usually keep this item');
});

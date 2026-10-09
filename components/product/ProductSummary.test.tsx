import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ProductSummary, type ProductSummaryProps } from './ProductSummary';

afterEach(cleanup);

const base: ProductSummaryProps = {
  title: 'Hex Dumbbells, Set of 2',
  brand: 'Lifelong',
  ratingText: '4.0 out of 5 stars, 22 ratings',
  price: <span>₹354</span>,
  taxNote: 'Inclusive of all taxes',
  availability: 'In stock',
  otherSellers: { label: 'New & Used (3) from ₹330', href: '/in/product/x/offers' },
  bullets: ['Rubber coated', 'Anti-roll hex heads'],
  description: 'A pair of hex dumbbells for home workouts.',
  options: [{ name: 'Colour', values: ['Black', 'Red'] }, { name: 'Size', values: ['2 kg', '3 kg'] }],
};

it('opens from a button the shortcut can press', () => {
  render(<ProductSummary {...base} />);
  // a closed popover is hidden, so the dialog's queries ask for hidden elements
  const open = screen.getByRole('button', { name: 'Product summary presents key product information' });
  expect(open).toHaveAttribute('data-shortcut', 'product-summary');
  expect(open).toHaveAttribute('popovertarget', 'product-summary');
  const box = screen.getByRole('dialog', { hidden: true });
  expect(box).toHaveAttribute('id', 'product-summary');
  expect(box).toHaveAttribute('popover', 'auto');
  expect(box).toHaveAttribute('aria-labelledby', 'product-summary-h');
  expect(document.getElementById('product-summary-h')).toHaveTextContent('Product summary: Hex Dumbbells, Set of 2');
});

it('sums up the price, what it is and what it comes in', () => {
  render(<ProductSummary {...base} />);
  const box = screen.getByRole('dialog', { hidden: true });
  expect(box).toHaveTextContent('From Lifelong');
  expect(box).toHaveTextContent('4.0 out of 5 stars, 22 ratings');
  expect(box).toHaveTextContent('₹354');
  expect(box).toHaveTextContent('Inclusive of all taxes');
  expect(box).toHaveTextContent('In stock');
  expect(within(box).getByRole('link', { hidden: true, name: 'New & Used (3) from ₹330' })).toHaveAttribute('href', '/in/product/x/offers');
  expect(within(box).getAllByRole('listitem', { hidden: true }).map((li) => li.textContent)).toEqual(['Rubber coated', 'Anti-roll hex heads']);
  expect(box).toHaveTextContent('A pair of hex dumbbells for home workouts.');
  expect(box).toHaveTextContent('ColourBlack, Red');
  expect(box).toHaveTextContent('Size2 kg, 3 kg');
});

it('leaves out what the product doesn’t have', () => {
  render(<ProductSummary {...base} brand={null} ratingText={null} price={null} otherSellers={null} bullets={[]} description={null} options={[]} availability="No longer available" />);
  const box = screen.getByRole('dialog', { hidden: true });
  expect(box).toHaveTextContent('Not available to buy right now');
  expect(box).not.toHaveTextContent('Inclusive of all taxes');
  for (const gone of ['From ', 'stars', 'Purchasing options', 'About this item', 'Product description', 'Options available']) expect(box).not.toHaveTextContent(gone);
});

it('moves focus to its heading when it opens', () => {
  render(<ProductSummary {...base} />);
  const box = screen.getByRole('dialog', { hidden: true });
  box.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
  expect(screen.getByRole('heading', { hidden: true, name: 'Product summary: Hex Dumbbells, Set of 2' })).toHaveFocus();
});

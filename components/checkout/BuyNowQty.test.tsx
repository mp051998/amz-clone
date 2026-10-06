import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BuyNowQty } from './BuyNowQty';

afterEach(cleanup);

const show = (qty: number, stock: number) =>
  render(<BuyNowQty checkoutHref="/in/checkout" productId="in-kettle" qty={qty} stock={stock} name="Kettle" />);
const step = (dir: 'Decrease' | 'Increase') => screen.getByRole('link', { name: `${dir} quantity Kettle` });

it('steps the quantity by reopening checkout for the same product', () => {
  show(2, 50);
  expect(screen.getByRole('group', { name: 'Quantity Kettle' })).toHaveTextContent('2');
  expect(step('Decrease')).toHaveAttribute('href', '/in/checkout?buy=in-kettle&qty=1');
  expect(step('Increase')).toHaveAttribute('href', '/in/checkout?buy=in-kettle&qty=3');
});

it('stops at 1 and at the Buy Now limit', () => {
  show(1, 50);
  expect(step('Decrease')).toHaveAttribute('aria-disabled', 'true');
  expect(step('Decrease')).not.toHaveAttribute('href');
  cleanup();
  show(10, 50);
  expect(step('Increase')).toHaveAttribute('aria-disabled', 'true');
  expect(step('Decrease')).toHaveAttribute('href', '/in/checkout?buy=in-kettle&qty=9');
});

it('stops at the stock on hand, and comes straight back down to it when over', () => {
  show(3, 3);
  expect(step('Increase')).toHaveAttribute('aria-disabled', 'true');
  cleanup();
  show(8, 3);
  expect(step('Increase')).toHaveAttribute('aria-disabled', 'true');
  expect(step('Decrease')).toHaveAttribute('href', '/in/checkout?buy=in-kettle&qty=3');
});

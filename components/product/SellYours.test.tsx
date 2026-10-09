import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SellYours } from './SellYours';

afterEach(cleanup);

it('asks whether you have one to sell and links to selling here', () => {
  render(<SellYours storeName="Store" href="/in/sell" />);
  expect(screen.getByText(/Have one to sell\?/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sell on Store' })).toHaveAttribute('href', '/in/sell');
});

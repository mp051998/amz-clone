import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CartNotes } from './CartNotes';

afterEach(cleanup);

it('says prices can change and where gift cards and promo codes go', () => {
  const { container } = render(<CartNotes giftCardHref="/in/gift-cards#balance" />);
  expect(container).toHaveTextContent('The price and availability of items are subject to change.');
  expect(container).toHaveTextContent('shows each one’s most recent price');
  expect(container).toHaveTextContent('Enter a promo code at checkout');
  expect(screen.getByRole('link', { name: 'redeem a gift card' })).toHaveAttribute('href', '/in/gift-cards#balance');
});

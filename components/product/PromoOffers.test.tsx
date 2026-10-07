import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PromoOffers } from './PromoOffers';

afterEach(cleanup);

it('lists each code that takes money off the product, with a link to the terms', () => {
  render(
    <PromoOffers
      currency="INR"
      allHref="/in/coupons#promo-codes"
      promos={[
        { code: 'STYLE20', percentOff: 20, description: '20% off fashion', category: { slug: 'fashion', name: 'Fashion' }, minSpendMinor: 99900 },
        { code: 'SAVE10', percentOff: 10, description: '10% off', minSpendMinor: 0 },
      ]}
    />,
  );
  const items = within(screen.getByRole('list', { name: 'Promotions' })).getAllByRole('listitem');
  expect(items.map((li) => li.textContent)).toEqual([
    'PromotionSave 20% on Fashion with code STYLE20 at checkout (spend ₹999+). Terms',
    'PromotionSave 10% with code SAVE10 at checkout. Terms',
  ]);
  expect(within(items[0]).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/in/coupons#promo-codes');
});

it('shows nothing without a promotion', () => {
  const { container } = render(<PromoOffers currency="USD" allHref="/coupons" promos={[]} />);
  expect(container).toBeEmptyDOMElement();
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BankOffers } from './BankOffers';
import type { BankOffer } from '@/lib/bank-offers';

afterEach(cleanup);

const hdfc: BankOffer = { id: 'hdfc-emi', bank: 'HDFC Bank', methods: ['emi'], percentOff: 10, maxOffMinor: 150000, minSpendMinor: 500000 };
const axis: BankOffer = { id: 'axis-nb', bank: 'Axis Bank', methods: ['netbanking'], percentOff: 5, maxOffMinor: 50000, minSpendMinor: 100000 };

it('leads with the biggest offer and lists every one’s terms', () => {
  const { container } = render(<BankOffers offers={[hdfc, axis]} currency="INR" />);
  expect(container).toHaveTextContent('Bank OfferUp to ₹1,500 off with HDFC Bank EMI.');
  expect(screen.getByText('See all 2 offers')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    '10% Instant Discount up to ₹1,500 on HDFC Bank EMI, on orders of ₹5,000 and above.',
    '5% Instant Discount up to ₹500 on Axis Bank net banking, on orders of ₹1,000 and above.',
  ]);
});

it('is nothing without offers', () => {
  const { container } = render(<BankOffers offers={[]} currency="INR" />);
  expect(container).toBeEmptyDOMElement();
});

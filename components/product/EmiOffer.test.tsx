import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { emiPlans } from '@/lib/emi';
import { EmiOffer } from './EmiOffer';

afterEach(cleanup);

it('says what EMI starts at, that No Cost EMI is there, and lists the plans', () => {
  const { container } = render(<EmiOffer plans={emiPlans('IN', 1_499_900)} currency="INR" />);
  expect(container).toHaveTextContent(/^EMI starts at ₹1,361\. No Cost EMI available\. EMI options/);
  const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
  expect(rows).toEqual(['3 monthsNo Cost₹5,000₹0', '6 monthsNo Cost₹2,500₹0', expect.stringMatching(/^9 months₹/), '12 months₹1,361₹1,333']);
});

it('shows nothing without EMI', () => {
  const { container } = render(<EmiOffer plans={emiPlans('US', 1_499_900)} currency="USD" />);
  expect(container).toBeEmptyDOMElement();
});

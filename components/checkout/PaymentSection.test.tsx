import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PaymentSection } from './PaymentSection';

afterEach(cleanup);

const base = { curSymbol: '$', defaultName: 'Alex Morgan' };

it('shows the gift card balance that will pay the order', () => {
  render(<PaymentSection {...base} methods={['giftcard', 'card']} balance={{ text: '$100.00', short: false, redeemHref: '/gift-cards#balance' }} />);
  expect(screen.getByText('$100.00')).toBeInTheDocument();
  expect(screen.getByText(/taken from your balance when you place the order/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Redeem a gift card' })).toBeNull();
});

it('points to redeeming a gift card when the balance is short', () => {
  render(<PaymentSection {...base} methods={['card', 'amazonpay']} balance={{ text: '₹50.00', short: true, redeemHref: '/in/gift-cards#balance' }} />);
  expect(screen.queryByText('₹50.00')).toBeNull(); // card is selected first
  fireEvent.click(screen.getByLabelText(/Wallet balance/));
  expect(screen.getByText('₹50.00')).toBeInTheDocument();
  expect(screen.getByText(/doesn.t cover this order/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Redeem a gift card' })).toHaveAttribute('href', '/in/gift-cards#balance');
});

it('offers adding money to the balance when card payments are set up', () => {
  render(<PaymentSection {...base} methods={['giftcard']} balance={{ text: '$5.00', short: true, redeemHref: '/gift-cards#balance', reloadHref: '/gift-cards#reload' }} />);
  fireEvent.click(screen.getByLabelText(/Gift card balance/));
  expect(screen.getByRole('link', { name: 'add money to your balance' })).toHaveAttribute('href', '/gift-cards#reload');
  expect(screen.getByText(/doesn.t cover this order/)).toHaveTextContent(/Redeem a gift card, add money to your balance, or choose another payment method\.$/);
});

it('without a readable balance, it doesn’t invent one', () => {
  render(<PaymentSection {...base} methods={['giftcard']} />);
  expect(screen.queryByText(/Available balance/)).toBeNull();
  expect(screen.getByText(/taken from your balance/)).toBeInTheDocument();
});

it('prices each EMI tenure for the order', () => {
  const emi = [
    { months: 3, text: '₹5,000 a month · No Cost EMI' },
    { months: 12, text: '₹1,361 a month · ₹1,333 interest' },
  ];
  render(<PaymentSection {...base} curSymbol="₹" methods={['emi']} emi={emi} />);
  const tenure = screen.getByRole('combobox', { name: 'Tenure' });
  expect([...tenure.querySelectorAll('option')].map((o) => [o.value, o.textContent])).toEqual([
    ['3', '3 months · ₹5,000 a month · No Cost EMI'],
    ['12', '12 months · ₹1,361 a month · ₹1,333 interest'],
  ]);
  expect(screen.getByText(/No Cost EMI takes the bank’s interest off/)).toBeInTheDocument();
});

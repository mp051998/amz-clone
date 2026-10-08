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

it('starts on how the shopper paid last time, marked as such', () => {
  render(<PaymentSection {...base} curSymbol="₹" methods={['card', 'upi', 'cod']} initial="upi" lastUsed="upi" />);
  const upi = screen.getByRole('radio', { name: /^UPI/ });
  expect(upi).toBeChecked();
  expect(upi.closest('label')).toHaveTextContent('Last used');
  expect(screen.getByLabelText('UPI ID')).toBeInTheDocument();
});

it('marks the last-used method without starting on it, and ignores one the store doesn’t offer', () => {
  render(<PaymentSection {...base} methods={['card', 'giftcard']} lastUsed="giftcard" balance={{ text: '$1.00', short: true, redeemHref: '/gift-cards#balance' }} />);
  expect(screen.getAllByRole('radio')[0]).toBeChecked();
  expect(screen.getByRole('radio', { name: /Gift card balance/ }).closest('label')).toHaveTextContent('Last used');
  cleanup();
  render(<PaymentSection {...base} methods={['card', 'upi']} initial="emi" />);
  expect(screen.getAllByRole('radio')[0]).toBeChecked();
});

it('shows the chosen bank’s offer under net banking and EMI, and what it takes off', () => {
  const bankOffers = {
    netbanking: { 'Axis Bank': { text: '5% Instant Discount up to ₹500.00 on Axis Bank net banking, on orders of ₹1,000.00 and above', savings: '₹99.95' } },
    emi: {
      'HDFC Bank': { text: '10% Instant Discount up to ₹1,500.00 on HDFC Bank EMI, on orders of ₹5,000.00 and above' },
      'ICICI Bank': { text: '10% Instant Discount up to ₹1,000.00 on ICICI Bank EMI and net banking', savings: '₹400.00' },
    },
  };
  render(<PaymentSection {...base} curSymbol="₹" methods={['upi', 'netbanking', 'emi']} bankOffers={bankOffers} />);
  expect(screen.getByLabelText(/Net banking/).closest('label')).toHaveTextContent('Bank offers');

  fireEvent.click(screen.getByLabelText(/Net banking/));
  // HDFC first: no net banking offer
  expect(screen.queryByText(/Bank Offer/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Choose your bank'), { target: { value: 'Axis Bank' } });
  expect(screen.getByRole('status')).toHaveTextContent('Bank Offer: −₹99.95 on this order. 5% Instant Discount up to ₹500.00 on Axis Bank net banking');

  fireEvent.click(screen.getByLabelText(/^EMI/));
  // HDFC's needs more than this order comes to
  expect(screen.getByRole('status')).toHaveTextContent(/^Bank Offer: 10% Instant Discount up to ₹1,500.00 on HDFC Bank EMI, on orders of ₹5,000.00 and above\.$/);
  fireEvent.change(screen.getByLabelText('Bank'), { target: { value: 'ICICI Bank' } });
  expect(screen.getByRole('status')).toHaveTextContent('Bank Offer: −₹400.00 on this order.');
  fireEvent.change(screen.getByLabelText('Bank'), { target: { value: 'Yes Bank' } });
  expect(screen.queryByRole('status')).toBeNull();
});

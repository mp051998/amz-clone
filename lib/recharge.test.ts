import { expect, it } from 'vitest';
import { CIRCLES, formatMobile, isCircle, isOperator, isRechargeMethod, mobileNumber, rechargeCashback } from './recharge';

it('reads an Indian mobile number, with or without +91, spaces or dashes', () => {
  expect(mobileNumber('9876543210')).toBe('9876543210');
  expect(mobileNumber('+91 98765-43210')).toBe('9876543210');
  expect(mobileNumber('919876543210')).toBe('9876543210');
  expect(mobileNumber('09876543210')).toBe('9876543210');
  expect(mobileNumber(' (987) 654 3210 ')).toBe('9876543210');
  // a 10-digit number that happens to start 91 stays as it is
  expect(mobileNumber('9198765432')).toBe('9198765432');
  for (const bad of ['5876543210', '987654321', '98765432101', 'abcdefghij', '', null, 9876543210]) expect(mobileNumber(bad)).toBeNull();
});

it('formats a number as two groups of five', () => {
  expect(formatMobile('9876543210')).toBe('98765 43210');
  expect(formatMobile('123')).toBe('123');
});

it('knows the operators, circles and ways to pay', () => {
  expect(['Jio', 'Airtel', 'Vi', 'BSNL', 'jio', 'Other'].map(isOperator)).toEqual([true, true, true, true, false, false]);
  expect(CIRCLES).toHaveLength(23);
  expect(['Mumbai', 'Delhi NCR', 'UP East', 'Atlantis', ''].map(isCircle)).toEqual([true, true, true, false, false]);
  expect(['amazonpay', 'upi', 'netbanking', 'card', 'cod', 'paylater'].map(isRechargeMethod)).toEqual([true, true, true, false, false, false]);
});

it('pays 2% back, rounded down to the rupee, up to ₹25', () => {
  expect(rechargeCashback(29_900)).toBe(500);
  expect(rechargeCashback(9_900)).toBe(100);
  expect(rechargeCashback(1_900)).toBe(0);
  expect(rechargeCashback(125_000)).toBe(2_500);
  expect(rechargeCashback(359_900)).toBe(2_500);
});

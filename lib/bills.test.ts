import { expect, it } from 'vitest';
import { billAccount, billMonth, BILL_CATEGORIES, BILL_CATEGORY, isBillAccount, isBillCategory, isBillMethod, rupeesMinor } from './bills';

it('knows the kinds of biller, each with a name, a title and what the account is called', () => {
  expect(BILL_CATEGORIES).toEqual(['electricity', 'dth', 'broadband', 'gas', 'water', 'fastag']);
  expect(isBillCategory('fastag')).toBe(true);
  expect(isBillCategory('rent')).toBe(false);
  expect(isBillCategory(undefined)).toBe(false);
  expect(BILL_CATEGORY.fastag).toEqual({ name: 'FASTag', title: 'FASTag recharge', account: 'Vehicle number' });
});

it('tidies an account as the database does, and checks it against a biller’s pattern', () => {
  expect(billAccount(' mh 12-ab 1234 ')).toBe('MH12AB1234');
  expect(billAccount(null)).toBe('');
  expect(isBillAccount('12345 67890', '^[0-9]{10}$')).toBe(true);
  expect(isBillAccount('12345', '^[0-9]{10}$')).toBe(false);
  expect(isBillAccount('mh12ab1234', '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$')).toBe(true);
  expect(isBillAccount('', '^.*$')).toBe(false);
  // a pattern JavaScript can't read refuses rather than throws
  expect(isBillAccount('1', '(')).toBe(false);
});

it('pays the way a recharge does', () => {
  expect(['amazonpay', 'upi', 'netbanking', 'card'].map(isBillMethod)).toEqual([true, true, true, false]);
});

it('reads whole rupees typed into the amount', () => {
  expect(rupeesMinor('1,500')).toBe(150_000);
  expect(rupeesMinor(' ₹ 250 ')).toBe(25_000);
  expect(rupeesMinor('99.50')).toBeNull();
  expect(rupeesMinor('0')).toBeNull();
  expect(rupeesMinor('-5')).toBeNull();
  expect(rupeesMinor('abc')).toBeNull();
  expect(rupeesMinor(null)).toBeNull();
});

it('names a bill’s month', () => {
  expect(billMonth('2026-10-01')).toBe('October 2026');
  expect(billMonth('2027-01-01', 'en-US')).toBe('January 2027');
});

import { describe, expect, it } from 'vitest';
import { bankOfferChoices, bankOfferMethodsText, bankOfferSavings, bankOfferText, bestBankOffer, paidUnits, type BankOffer } from './bank-offers';
import type { Product } from './types';

const hdfc: BankOffer = { id: 'hdfc-emi', bank: 'HDFC Bank', methods: ['emi'], percentOff: 10, maxOffMinor: 150000, minSpendMinor: 500000 };
const icici: BankOffer = { id: 'icici-emi-nb', bank: 'ICICI Bank', methods: ['emi', 'netbanking'], percentOff: 10, maxOffMinor: 100000, minSpendMinor: 300000 };
const axis: BankOffer = { id: 'axis-nb', bank: 'Axis Bank', methods: ['netbanking'], percentOff: 5, maxOffMinor: 50000, minSpendMinor: 100000 };
const inr = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN')}`;

describe('bankOfferSavings', () => {
  it('takes its percentage off each unit, rounded down', () => {
    expect(bankOfferSavings(axis, [{ unitPaidMinor: 199900, qty: 1 }])).toBe(9995);
    expect(bankOfferSavings(axis, [{ unitPaidMinor: 99999, qty: 3 }])).toBe(3 * 4999);
  });

  it('scales every unit down together to stay under the cap, as place_order does', () => {
    // 10% of ₹20,999 is ₹2,099.90: capped at ₹1,500
    expect(bankOfferSavings(hdfc, [{ unitPaidMinor: 2099900, qty: 1 }])).toBe(150000);
    // two units at ₹18,999: ₹1,899.90 each, ₹3,799.80 in all, so ₹750 each
    expect(bankOfferSavings(hdfc, [{ unitPaidMinor: 1899900, qty: 2 }])).toBe(150000);
    // uneven lines round down under the cap
    const s = bankOfferSavings(hdfc, [{ unitPaidMinor: 1000001, qty: 1 }, { unitPaidMinor: 700003, qty: 3 }]);
    expect(s).toBeLessThanOrEqual(150000);
    expect(s).toBeGreaterThan(149990);
  });

  it('is nothing under the minimum spend', () => {
    expect(bankOfferSavings(hdfc, [{ unitPaidMinor: 499999, qty: 1 }])).toBe(0);
    expect(bankOfferSavings(hdfc, [{ unitPaidMinor: 250000, qty: 2 }])).toBe(50000);
  });
});

describe('bestBankOffer', () => {
  const lines = [{ unitPaidMinor: 600000, qty: 1 }];

  it('picks the bank’s offer for the method that saves most (the first by id on a tie)', () => {
    const better: BankOffer = { ...icici, id: 'icici-emi-plus', methods: ['emi'], maxOffMinor: 200000 };
    expect(bestBankOffer([hdfc, icici, better, axis], 'emi', 'ICICI Bank', lines)).toEqual({ offer: icici, savingsMinor: 60000 });
    expect(bestBankOffer([hdfc, icici, axis], 'emi', 'HDFC Bank', lines)).toEqual({ offer: hdfc, savingsMinor: 60000 });
    expect(bestBankOffer([hdfc, icici, better], 'emi', 'ICICI Bank', [{ unitPaidMinor: 1600000, qty: 1 }])).toEqual({ offer: better, savingsMinor: 160000 });
  });

  it('is none for another bank, another method, or under the minimum', () => {
    expect(bestBankOffer([hdfc, icici, axis], 'emi', 'Yes Bank', lines)).toBeNull();
    expect(bestBankOffer([hdfc, icici, axis], 'netbanking', 'HDFC Bank', lines)).toBeNull();
    expect(bestBankOffer([hdfc, icici, axis], 'emi', 'HDFC Bank', [{ unitPaidMinor: 400000, qty: 1 }])).toBeNull();
  });
});

describe('paidUnits', () => {
  it('takes each line’s discounts off its units', () => {
    const product = (priceMinor: number) => ({ priceMinor }) as Product;
    expect(paidUnits([{ product: product(5000), qty: 2, discountMinor: 1000 }, { product: product(300), qty: 1 }])).toEqual([
      { unitPaidMinor: 4500, qty: 2 },
      { unitPaidMinor: 300, qty: 1 },
    ]);
  });
});

describe('bankOfferText', () => {
  it('says what it takes off, through which bank and methods, from what spend', () => {
    expect(bankOfferText(hdfc, inr)).toBe('10% Instant Discount up to ₹1,500 on HDFC Bank EMI, on orders of ₹5,000 and above');
    expect(bankOfferText({ ...icici, minSpendMinor: 0 }, inr)).toBe('10% Instant Discount up to ₹1,000 on ICICI Bank EMI and net banking');
    expect(bankOfferMethodsText(['netbanking', 'emi'])).toBe('EMI and net banking');
  });
});

describe('bankOfferChoices', () => {
  it('gives each method and bank its offer for these items, or the one they don’t reach yet', () => {
    const small: BankOffer = { ...hdfc, id: 'hdfc-emi-small', percentOff: 5, maxOffMinor: 20000, minSpendMinor: 200000 };
    const choices = bankOfferChoices([hdfc, icici, axis, small], [{ unitPaidMinor: 400000, qty: 1 }]);
    expect(choices.emi).toEqual({
      'HDFC Bank': { offer: small, savingsMinor: 20000 },
      'ICICI Bank': { offer: icici, savingsMinor: 40000 },
    });
    expect(choices.netbanking).toEqual({
      'ICICI Bank': { offer: icici, savingsMinor: 40000 },
      'Axis Bank': { offer: axis, savingsMinor: 20000 },
    });
    expect(bankOfferChoices([hdfc, small], [{ unitPaidMinor: 1000, qty: 1 }]).emi).toEqual({ 'HDFC Bank': { offer: small, savingsMinor: 0 } });
    expect(bankOfferChoices([], [{ unitPaidMinor: 1000, qty: 1 }])).toEqual({});
  });
});

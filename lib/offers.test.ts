import { describe, expect, it } from 'vitest';
import { buyableAs, buyingChoicesText, conditionLabel, isOfferKind, isUsedCondition, kindsLabel, offerKind, offerSummary } from './offers';

describe('conditions', () => {
  it('labels each condition as Amazon does, new when there is none', () => {
    expect(conditionLabel(undefined)).toBe('New');
    expect(conditionLabel('renewed')).toBe('Renewed');
    expect(conditionLabel('used_like_new')).toBe('Used – Like New');
    expect(conditionLabel('used_acceptable')).toBe('Used – Acceptable');
  });

  it('knows the used conditions and offer groups', () => {
    expect(isUsedCondition('used_good')).toBe(true);
    expect(isUsedCondition('new')).toBe(false);
    expect(isUsedCondition('toString')).toBe(false);
    expect(isOfferKind('renewed')).toBe(true);
    expect(isOfferKind('refurbished')).toBe(false);
    expect([offerKind({}), offerKind({ condition: 'renewed' }), offerKind({ condition: 'used_very_good' })]).toEqual(['new', 'renewed', 'used']);
  });
});

describe('offerSummary', () => {
  it('counts the offers and finds the lowest price, overall and per group', () => {
    const s = offerSummary([{ priceMinor: 1799 }, { priceMinor: 949, condition: 'used_very_good' }, { priceMinor: 1650 }, { priceMinor: 725, condition: 'used_good' }]);
    expect(s).toEqual({
      count: 4,
      fromMinor: 725,
      kinds: [
        { kind: 'new', count: 2, fromMinor: 1650 },
        { kind: 'used', count: 2, fromMinor: 725 },
      ],
    });
    expect(kindsLabel(s!)).toBe('New & Used');
  });

  it('names one group alone and three as a list', () => {
    expect(kindsLabel(offerSummary([{ priceMinor: 100, condition: 'renewed' }])!)).toBe('Renewed');
    expect(kindsLabel(offerSummary([{ priceMinor: 100 }, { priceMinor: 90, condition: 'renewed' }, { priceMinor: 80, condition: 'used_good' }])!)).toBe('New, Renewed & Used');
  });

  it('is null with nothing to buy', () => {
    expect(offerSummary([])).toBeNull();
  });
});

describe('buying choices', () => {
  it('counts other sellers’ offers as Amazon’s results do, renewed as used', () => {
    expect(buyingChoicesText(offerSummary([{ priceMinor: 100 }])!)).toBe('(1 new offer)');
    expect(buyingChoicesText(offerSummary([{ priceMinor: 100, condition: 'renewed' }, { priceMinor: 90, condition: 'used_good' }])!)).toBe('(2 used offers)');
    expect(buyingChoicesText(offerSummary([{ priceMinor: 100 }, { priceMinor: 90, condition: 'renewed' }, { priceMinor: 80 }])!)).toBe('(3 used & new offers)');
  });

  it('can buy it new when it’s in stock or offered new, otherwise only as offered', () => {
    const used = offerSummary([{ priceMinor: 90, condition: 'used_good' }]);
    expect(buyableAs({ stock: 2 }, null, 'new')).toBe(true);
    expect(buyableAs({ stock: 0 }, used, 'new')).toBe(false);
    expect(buyableAs({ stock: 0 }, offerSummary([{ priceMinor: 90 }]), 'new')).toBe(true);
    expect(buyableAs({ stock: 2 }, used, 'used')).toBe(true);
    expect(buyableAs({ stock: 2 }, used, 'renewed')).toBe(false);
    expect(buyableAs({ stock: 2 }, undefined, 'used')).toBe(false);
  });
});

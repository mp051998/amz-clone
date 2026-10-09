import { describe, expect, it } from 'vitest';
import { productPerks, type PerkInput } from './perks';

const base: PerkInput = {
  priceMinor: 199_900,
  freeThresholdMinor: 49_900,
  cod: true,
  returnDays: 10,
  replacementOnly: false,
  shipsFrom: 'Seller',
  policyHref: '/in/customer-service/help/returns-refunds',
  money: (minor) => `₹${(minor / 100).toLocaleString('en-IN')}`,
};
const labels = (x: Partial<PerkInput>) => productPerks({ ...base, ...x }).map((p) => p.label);

describe('productPerks', () => {
  it('lists free delivery, Pay on Delivery, the return window and secure transaction', () => {
    expect(labels({})).toEqual(['Free Delivery', 'Pay on Delivery', '10 days Returnable', 'Secure transaction']);
    expect(productPerks(base).find((p) => p.key === 'cod')?.detail).toBe('Pay by cash, UPI or card when it arrives, on orders of up to ₹50,000.');
  });

  it('gives free delivery under the threshold only to members', () => {
    expect(labels({ priceMinor: 29_900 })).not.toContain('Free Delivery');
    const member = productPerks({ ...base, priceMinor: 29_900, member: 'Plus' });
    expect(member[0]).toMatchObject({ key: 'delivery', detail: expect.stringContaining('your Plus membership') });
  });

  it('leaves out Pay on Delivery over ₹50,000 or where the store doesn’t take it', () => {
    expect(labels({ priceMinor: 5_000_000 })).toContain('Pay on Delivery');
    expect(labels({ priceMinor: 5_000_100 })).not.toContain('Pay on Delivery');
    expect(labels({ cod: false })).not.toContain('Pay on Delivery');
  });

  it('says replacement only, or not returnable', () => {
    expect(labels({ returnDays: 7, replacementOnly: true })).toContain('7 days Replacement');
    expect(labels({ returnDays: 0 })).toContain('Non-Returnable');
  });

  it('tables what each return reason gets, as the return form allows', () => {
    const returns = (x: Partial<PerkInput>) => productPerks({ ...base, ...x }).find((p) => p.key === 'returns')!;
    const r = returns({});
    expect(r.rules).toEqual([
      { reason: 'Damaged, defective, wrong, not as described or missing parts', period: '10 days from delivery', policy: 'Full refund or replacement' },
      { reason: 'Any other reason', period: '10 days from delivery', policy: 'Full refund' },
    ]);
    expect(r.instructions).toMatch(/original condition and packaging/);
    expect(r.more).toEqual({ label: 'Read full returns policy', href: '/in/customer-service/help/returns-refunds' });
    // something in sizes goes back for another size when it doesn't fit
    expect(returns({ sized: true }).rules?.map((x) => x.policy)).toEqual(['Full refund or replacement', 'Full refund or another size', 'Full refund']);
    // replacement only: faults, replaced
    expect(returns({ returnDays: 7, replacementOnly: true }).rules).toEqual([
      { reason: 'Damaged, defective, wrong, not as described or missing parts', period: '7 days from delivery', policy: 'Replacement, or a refund when it can’t be replaced' },
    ]);
    // not returnable: no table, no instructions
    expect(returns({ returnDays: 0 })).toEqual({ key: 'returns', label: 'Non-Returnable', detail: 'This item can’t be returned once it’s delivered.' });
  });

  it('adds Amazon Delivered before secure transaction when Amazon ships it', () => {
    expect(labels({ shipsFrom: 'Amazon' })).toEqual(['Free Delivery', 'Pay on Delivery', '10 days Returnable', 'Amazon Delivered', 'Secure transaction']);
    expect(productPerks({ ...base, shipsFrom: 'Amazon' }).find((p) => p.key === 'fulfilled')?.detail).toMatch(/whoever sells it/);
  });
});

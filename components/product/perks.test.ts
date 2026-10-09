import { describe, expect, it } from 'vitest';
import { productPerks, type PerkInput } from './perks';

const base: PerkInput = {
  priceMinor: 199_900,
  freeThresholdMinor: 49_900,
  cod: true,
  returnDays: 10,
  replacementOnly: false,
  shipsFrom: 'Seller',
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

  it('adds Amazon Delivered before secure transaction when Amazon ships it', () => {
    expect(labels({ shipsFrom: 'Amazon' })).toEqual(['Free Delivery', 'Pay on Delivery', '10 days Returnable', 'Amazon Delivered', 'Secure transaction']);
    expect(productPerks({ ...base, shipsFrom: 'Amazon' }).find((p) => p.key === 'fulfilled')?.detail).toMatch(/whoever sells it/);
  });
});

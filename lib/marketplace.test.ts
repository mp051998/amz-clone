import { expect, test } from 'vitest';
import { signInPath } from './marketplace';
import { amazon } from './amazon';
import { amazonIn } from './marketplace-in';

test('marketplaces provide distinct home and navigation configurations', () => {
  expect(amazon.ui.home).not.toEqual(amazonIn.ui.home);
  expect(amazon.ui.home[0].kind).toBe('campaign');
  expect(amazonIn.ui.home[0].kind).toBe('campaign');
  expect(amazonIn.nav.subnav).toContain('Mobiles');
});

test('sign-in links come back to the page they were followed from', () => {
  expect(signInPath(amazon, '/product/k1')).toBe('/signin?next=%2Fproduct%2Fk1');
  expect(signInPath(amazonIn, '/s?k=kettle&page=2')).toBe('/in/signin?next=%2Fs%3Fk%3Dkettle%26page%3D2');
  expect(signInPath(amazonIn, '/cart', { create: true })).toBe('/in/signin?new=1&next=%2Fcart');
  // nowhere to come back to: home, unknown, or the sign-in pages themselves
  expect(signInPath(amazon, '/')).toBe('/signin');
  expect(signInPath(amazon, null)).toBe('/signin');
  expect(signInPath(amazonIn, '/signin?error=badcreds&next=%2Forders')).toBe('/in/signin');
  expect(signInPath(amazon, '/signin/forgot')).toBe('/signin');
  expect(signInPath(amazon, '/auth/confirm?x=1', { create: true })).toBe('/signin?new=1');
  expect(signInPath(amazon, '/signing-tips')).toBe('/signin?next=%2Fsigning-tips');
});

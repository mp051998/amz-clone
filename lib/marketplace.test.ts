import { expect, test } from 'vitest';
import { amazon } from './amazon';
import { amazonIn } from './marketplace-in';

test('marketplaces provide distinct home and navigation configurations', () => {
  expect(amazon.ui.home).not.toEqual(amazonIn.ui.home);
  expect(amazon.ui.home[0].kind).toBe('campaign');
  expect(amazonIn.ui.home[0].kind).toBe('campaign');
  expect(amazonIn.nav.subnav).toContain('Mobiles');
});

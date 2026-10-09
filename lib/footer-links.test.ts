import { expect, it } from 'vitest';
import { footerDest } from './footer-links';
import { HELP_TOPIC_SLUGS } from './help-topics';

it('sends the returns and shipping help links to their help topics', () => {
  expect(footerDest('Returns & Replacements')).toEqual({ path: '/customer-service/help/returns-refunds' });
  expect(footerDest('Shipping Rates & Policies')).toEqual({ path: '/customer-service/help/shipping-delivery' });
  expect(footerDest('Help')).toEqual({ path: '/customer-service' });
});

it('sends Returns Centre to Your returns', () => {
  expect(footerDest('Returns Centre')).toEqual({ path: '/returns' });
});

it('only links help topics that exist', () => {
  for (const label of ['Returns & Replacements', 'Shipping Rates & Policies', '100% Purchase Protection']) {
    const dest = footerDest(label);
    const slug = 'path' in dest ? dest.path.match(/^\/customer-service\/help\/(.+)$/)?.[1] : undefined;
    expect(HELP_TOPIC_SLUGS).toContain(slug);
  }
});

it('falls back to the store home for a label it does not know', () => {
  expect(footerDest('Nope')).toEqual({ path: '/' });
});

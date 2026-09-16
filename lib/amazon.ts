import type { PublicMarketplace } from './contracts';

/** amazon.com (US) store config — the single marketplace this clone renders. */
export const amazon: PublicMarketplace = {
  id: 'US',
  name: 'Amazon',
  hostname: 'amazon.com',
  country: 'US',
  locale: { default: 'en-US', supported: ['en-US', 'es-US', 'zh-CN', 'de-DE', 'pt-BR'] },
  currency: { code: 'USD', symbol: '$', display: ['USD'], fractionDigits: 2, grouping: 'western' },
  dates: { order: 'MDY', timeZone: 'America/Los_Angeles' },
  pricing: { taxInclusive: false, listLabel: 'List Price', savingsFirst: true },
  address: { schema: 'US', postcode: { label: 'ZIP Code', pattern: '^\\d{5}(-\\d{4})?$' } },
  payments: [
    { method: 'card', phase: 1 },
    { method: 'giftcard', phase: 1 },
  ],
  delivery: { methods: ['standard', 'two-day', 'one-day', 'same-day'], freeThresholdMinor: 3500 },
  membership: { name: 'Prime' },
  nav: {
    subnav: ["Today's Deals", 'Prime Video', 'Customer Service', 'Registry', 'Gift Cards', 'Sell'],
    departments: [
      'Electronics',
      'Computers',
      'Smart Home',
      'Home & Kitchen',
      'Fashion',
      'Beauty & Personal Care',
      'Books',
      'Toys & Games',
      'Sports & Outdoors',
      'Automotive',
      'Pet Supplies',
      'Grocery',
    ],
  },
  features: { displayCurrencySwitch: false, protectionPlans: true, giftWrap: true },
};

import type { PublicMarketplace } from './contracts';

/** amazon.in (India) store config — the second marketplace, selected via the /in path prefix. */
export const amazonIn: PublicMarketplace = {
  id: 'IN',
  name: 'Amazon',
  hostname: 'amazon.in',
  country: 'IN',
  locale: { default: 'en-IN', supported: ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'bn-IN'] },
  currency: { code: 'INR', symbol: '₹', display: ['INR'], fractionDigits: 0, grouping: 'indian' },
  dates: { order: 'DMY', timeZone: 'Asia/Kolkata' },
  pricing: { taxInclusive: true, listLabel: 'M.R.P.', savingsFirst: true, taxNote: 'Inclusive of all taxes' },
  address: {
    schema: 'IN',
    postcode: { label: 'Pincode', pattern: '^[1-9]\\d{5}$' },
    types: ['home', 'office'],
  },
  payments: [
    { method: 'upi', phase: 1 },
    { method: 'card', phase: 1 },
    { method: 'netbanking', phase: 1 },
    { method: 'cod', phase: 1 },
    { method: 'emi', phase: 1 },
    { method: 'amazonpay', phase: 1 },
  ],
  delivery: { methods: ['standard', 'one-day', 'same-day'], freeThresholdMinor: 49900 },
  membership: { name: 'Prime' },
  nav: {
    subnav: ['Mobiles', 'Prime Video', "Today's Deals", 'Amazon Pay', 'Bestsellers', 'Customer Service', 'New Releases', 'Prime', 'Sell'],
    departments: [
      'Mobiles',
      'Electronics',
      'Computers',
      'Home & Kitchen',
      'Fashion',
      'Beauty & Personal Care',
      'Books',
      'Toys & Games',
      'Sports & Outdoors',
    ],
  },
  ui: {
    navPromotion: { label: 'Great Indian Festival', href: '/deals' },
    home: [
      {
        kind: 'campaign',
        id: 'in-festival-campaign',
        campaign: {
          id: 'in-festival',
          title: 'Great Indian Festival',
          cta: 'Shop deals',
          href: '/s?dept=electronics',
          image: '/campaigns/in-festival.svg',
          alt: 'Festival gift boxes for a Great Indian Festival campaign',
        },
      },
      {
        kind: 'deal-rail',
        id: 'in-festival-deals',
        title: 'Deals of the day',
        productIds: ['in-61BWskzWNIL', 'in-711l4y8aNlL', 'in-71QdB7hDCAL', 'in-51lPcFkwYmL'],
      },
      { kind: 'merchandising-grid', id: 'in-value-finds', cardIds: ['electronics', 'home-kitchen', 'fashion', 'beauty'] },
    ],
  },
  features: { displayCurrencySwitch: true, languageSwitch: true, codAvailable: true, protectionPlans: true, giftWrap: true },
};

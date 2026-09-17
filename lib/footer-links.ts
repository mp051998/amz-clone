/**
 * Resolves a footer label (column link, sub-brand, or legal link) to a destination.
 * `{ path }` is an internal route (the caller store-prefixes it with storePath);
 * `{ url }` is an external site opened in a new tab. Anything not listed falls back
 * to the store home, so no footer link is ever a dead `#`.
 */
export type FooterDest = { path: string } | { url: string };

const FOOTER_LINKS: Record<string, FooterDest> = {
  // ---- Legal (both stores) → authored content under /legal/[slug] ----
  'Conditions of Use': { path: '/legal/conditions-of-use' },
  'Conditions of Use & Sale': { path: '/legal/conditions-of-use' },
  'Privacy Notice': { path: '/legal/privacy-notice' },
  'Interest-Based Ads': { path: '/legal/interest-based-ads' },
  'Consumer Health Data Privacy Disclosure': { path: '/legal/health-data-privacy' },
  'Your Ads Privacy Choices': { path: '/legal/ads-privacy-choices' },

  // ---- Get to Know Us ----
  'About Amazon': { url: 'https://www.aboutamazon.com' },
  Blog: { url: 'https://www.aboutamazon.com' },
  Careers: { url: 'https://www.amazon.jobs' },
  'Investor Relations': { url: 'https://ir.aboutamazon.com' },
  'Amazon Devices': { path: '/s?dept=electronics' },
  'Amazon Science': { url: 'https://www.amazon.science' },
  'Press Releases': { url: 'https://press.aboutamazon.in' },

  // ---- Connect with Us (IN) ----
  Facebook: { url: 'https://www.facebook.com/AmazonIN' },
  Twitter: { url: 'https://twitter.com/amazonIN' },
  Instagram: { url: 'https://www.instagram.com/amazondotin' },

  // ---- Make Money with Us ----
  'Sell products on Amazon': { path: '/sell' },
  'Sell on Amazon': { path: '/sell' },
  'Sell on Amazon Business': { path: '/business' },
  'Sell apps on Amazon': { url: 'https://developer.amazon.com' },
  'Sell under Amazon Accelerator': { url: 'https://sell.amazon.in' },
  'Protect and Build Your Brand': { url: 'https://brandservices.amazon.in' },
  'Amazon Global Selling': { url: 'https://sell.amazon.in/grow/amazon-global-selling' },
  'Supply to Amazon': { url: 'https://supply.amazon.in' },
  'Become an Affiliate': { url: 'https://affiliate-program.amazon.com' },
  'Fulfilment by Amazon': { url: 'https://sell.amazon.in/fulfilment-by-amazon' },
  'Advertise Your Products': { url: 'https://advertising.amazon.com' },
  'Amazon Pay on Merchants': { path: '/amazon-pay' },
  'Self-Publish with Us': { url: 'https://kdp.amazon.com' },
  'Host an Amazon Hub': { url: 'https://hub.amazon.com' },

  // ---- Amazon Payment Products (US) ----
  'Amazon Business Card': { path: '/gift-cards' },
  'Shop with Points': { path: '/amazon-pay' },
  'Reload Your Balance': { path: '/amazon-pay' },
  'Amazon Currency Converter': { path: '/amazon-pay' },

  // ---- Let Us Help You ----
  'Your Account': { path: '/account' },
  'Your Orders': { path: '/orders' },
  'Returns Centre': { path: '/orders' },
  'Returns & Replacements': { path: '/customer-service' },
  'Shipping Rates & Policies': { path: '/customer-service' },
  'Recalls and Product Safety Alerts': { path: '/customer-service' },
  '100% Purchase Protection': { path: '/customer-service' },
  'Manage Your Content and Devices': { path: '/account' },
  'Amazon App Download': { path: '/' },
  Help: { path: '/customer-service' },

  // ---- Sub-brands: internal ----
  'Amazon Business': { path: '/business' },
  'Prime Now': { path: '/prime' },
  'Home Services': { path: '/' },
  AmazonGlobal: { path: '/' },

  // ---- Sub-brands: external ----
  'Amazon Music': { url: 'https://music.amazon.com' },
  'Amazon Prime Music': { url: 'https://music.amazon.in' },
  'Amazon Ads': { url: 'https://advertising.amazon.com' },
  '6pm': { url: 'https://www.6pm.com' },
  AbeBooks: { url: 'https://www.abebooks.com' },
  ACX: { url: 'https://www.acx.com' },
  'Amazon Web Services': { url: 'https://aws.amazon.com' },
  Audible: { url: 'https://www.audible.com' },
  'Box Office Mojo': { url: 'https://www.boxofficemojo.com' },
  Goodreads: { url: 'https://www.goodreads.com' },
  IMDb: { url: 'https://www.imdb.com' },
  IMDbPro: { url: 'https://pro.imdb.com' },
  'Kindle Direct Publishing': { url: 'https://kdp.amazon.com' },
  'Prime Video Direct': { url: 'https://videodirect.amazon.com' },
  Shopbop: { url: 'https://www.shopbop.com' },
  'Woot!': { url: 'https://www.woot.com' },
  Zappos: { url: 'https://www.zappos.com' },
  Ring: { url: 'https://ring.com' },
  'eero WiFi': { url: 'https://eero.com' },
  Blink: { url: 'https://blinkforhome.com' },
  'Amazon Pharmacy': { url: 'https://pharmacy.amazon.com' },
};

/** Destination for a footer label; unknown labels fall back to the store home. */
export const footerDest = (label: string): FooterDest => FOOTER_LINKS[label] ?? { path: '/' };

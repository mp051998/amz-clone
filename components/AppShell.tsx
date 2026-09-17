import type { ReactNode } from 'react';
import { allCategorySlugs } from '@/lib/catalog-market';
import { cartCount as readCartCount } from '@/lib/cart';
import { readUser, firstName } from '@/lib/auth';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { footerDest } from '@/lib/footer-links';
import { CountryFlyout } from './chrome/CountryFlyout';
import { HeaderBelt } from './chrome/HeaderBelt';
import { SubNav } from './chrome/SubNav';
import { Footer } from './chrome/Footer';

const CATALOG_SLUGS = allCategorySlugs;

/** department label → catalog category slug (only some departments carry products). */
const DEPT_SLUG: Record<string, string> = {
  Mobiles: 'mobiles',
  Electronics: 'electronics',
  Computers: 'computers',
  'Home & Kitchen': 'home-kitchen',
  Fashion: 'fashion',
  'Beauty & Personal Care': 'beauty',
  Books: 'books',
  'Toys & Games': 'toys',
  'Sports & Outdoors': 'sports',
};

/** sub-nav item → path (before store prefixing). Covers both US and IN sub-nav labels. */
const ITEM_PATHS: Record<string, string> = {
  "Today's Deals": '/deals',
  'Customer Service': '/customer-service',
  Registry: '/registry',
  'Gift Cards': '/gift-cards',
  Sell: '/sell',
  Mobiles: '/s?dept=mobiles',
  'Prime Video': '/prime-video',
  'Amazon Pay': '/amazon-pay',
  Bestsellers: '/bestsellers',
  'New Releases': '/new-releases',
  Prime: '/prime',
};

/** Footer link columns per marketplace, mirroring the real amazon.com / amazon.in footers. */
const FOOTER_COLUMNS: Record<'US' | 'IN', { heading: string; links: string[] }[]> = {
  US: [
    { heading: 'Get to Know Us', links: ['Careers', 'Blog', 'About Amazon', 'Investor Relations', 'Amazon Devices', 'Amazon Science'] },
    { heading: 'Make Money with Us', links: ['Sell products on Amazon', 'Sell on Amazon Business', 'Sell apps on Amazon', 'Become an Affiliate', 'Advertise Your Products', 'Self-Publish with Us', 'Host an Amazon Hub'] },
    { heading: 'Amazon Payment Products', links: ['Amazon Business Card', 'Shop with Points', 'Reload Your Balance', 'Amazon Currency Converter'] },
    { heading: 'Let Us Help You', links: ['Your Account', 'Your Orders', 'Shipping Rates & Policies', 'Returns & Replacements', 'Manage Your Content and Devices', 'Help'] },
  ],
  IN: [
    { heading: 'Get to Know Us', links: ['About Amazon', 'Careers', 'Press Releases', 'Amazon Science'] },
    { heading: 'Connect with Us', links: ['Facebook', 'Twitter', 'Instagram'] },
    { heading: 'Make Money with Us', links: ['Sell on Amazon', 'Sell under Amazon Accelerator', 'Protect and Build Your Brand', 'Amazon Global Selling', 'Supply to Amazon', 'Become an Affiliate', 'Fulfilment by Amazon', 'Advertise Your Products', 'Amazon Pay on Merchants'] },
    { heading: 'Let Us Help You', links: ['Your Account', 'Returns Centre', 'Recalls and Product Safety Alerts', '100% Purchase Protection', 'Amazon App Download', 'Help'] },
  ],
};

export interface AppShellProps {
  children: ReactNode;
  cartCount?: number;
}

/** Amazon's family of companies — the sub-brand grid at the very bottom of the real footer. */
const FOOTER_SUBBRANDS: Record<'US' | 'IN', { name: string; blurb: string }[]> = {
  US: [
    { name: 'Amazon Music', blurb: 'Stream millions of songs' },
    { name: 'Amazon Ads', blurb: 'Reach customers wherever they spend their time' },
    { name: '6pm', blurb: 'Score deals on fashion brands' },
    { name: 'AbeBooks', blurb: 'Books, art & collectibles' },
    { name: 'ACX', blurb: 'Audiobook Publishing Made Easy' },
    { name: 'Sell on Amazon', blurb: 'Start a Selling Account' },
    { name: 'Amazon Business', blurb: 'Everything For Your Business' },
    { name: 'AmazonGlobal', blurb: 'Ship Orders Internationally' },
    { name: 'Home Services', blurb: 'Experienced Pros · Happiness Guarantee' },
    { name: 'Amazon Web Services', blurb: 'Scalable Cloud Computing Services' },
    { name: 'Audible', blurb: 'Listen to Books & Original Audio Performances' },
    { name: 'Box Office Mojo', blurb: 'Find Movie Box Office Data' },
    { name: 'Goodreads', blurb: 'Book reviews & recommendations' },
    { name: 'IMDb', blurb: 'Movies, TV & Celebrities' },
    { name: 'IMDbPro', blurb: 'Get Info Entertainment Professionals Need' },
    { name: 'Kindle Direct Publishing', blurb: 'Indie Digital & Print Publishing Made Easy' },
    { name: 'Prime Video Direct', blurb: 'Video Distribution Made Easy' },
    { name: 'Shopbop', blurb: 'Designer Fashion Brands' },
    { name: 'Woot!', blurb: 'Deals and Shenanigans' },
    { name: 'Zappos', blurb: 'Shoes & Clothing' },
    { name: 'Ring', blurb: 'Smart Home Security Systems' },
    { name: 'eero WiFi', blurb: 'Stream 4K Video in Every Room' },
    { name: 'Blink', blurb: 'Smart Security for Every Home' },
    { name: 'Amazon Pharmacy', blurb: 'Prescriptions delivered to your door' },
  ],
  IN: [
    { name: 'AbeBooks', blurb: 'Books, art & collectibles' },
    { name: 'Amazon Web Services', blurb: 'Scalable Cloud Computing Services' },
    { name: 'Audible', blurb: 'Download Audio Books' },
    { name: 'IMDb', blurb: 'Movies, TV & Celebrities' },
    { name: 'Shopbop', blurb: 'Designer Fashion Brands' },
    { name: 'Amazon Business', blurb: 'Everything For Your Business' },
    { name: 'Prime Now', blurb: '2-Hour Delivery on Everyday Items' },
    { name: 'Amazon Prime Music', blurb: '100 million songs, ad-free' },
  ],
};

/** Locale bar + legal line, mirroring each store's real footer. */
const FOOTER_LOCALE: Record<'US' | 'IN', { language: string; currency?: string; country: string }> = {
  US: { language: 'English', currency: '$ USD - U.S. Dollar', country: '🇺🇸 United States' },
  IN: { language: 'English', country: '🇮🇳 India' },
};
const FOOTER_LEGAL: Record<'US' | 'IN', string[]> = {
  US: ['Conditions of Use', 'Privacy Notice', 'Consumer Health Data Privacy Disclosure', 'Your Ads Privacy Choices'],
  IN: ['Conditions of Use & Sale', 'Privacy Notice', 'Interest-Based Ads'],
};
const FOOTER_COPYRIGHT = '© 1996–2026, Amazon.com, Inc. or its affiliates';

/** Amazon chrome wrapper: header belt + sub-nav on top, footer below (design.md §5). Store-aware. */
export async function AppShell({ children, cartCount }: AppShellProps) {
  const store = await getMarketplace();
  const count = cartCount ?? (await readCartCount());
  const user = await readUser();
  const key = store.id === 'IN' ? 'IN' : 'US';

  const departments = store.nav.departments;
  const deptHref = (label: string) => {
    const slug = DEPT_SLUG[label];
    return storePath(store, slug && CATALOG_SLUGS.has(slug) ? `/s?dept=${slug}` : '/s');
  };
  const itemHrefs: Record<string, string> = Object.fromEntries(
    store.nav.subnav.map((item) => [item, storePath(store, ITEM_PATHS[item] ?? '/s')]),
  );
  // flattened link lists for the mobile hamburger drawer
  const deptLinks = departments.map((label) => ({ label, href: deptHref(label) }));
  const programLinks = store.nav.subnav.map((label) => ({ label, href: itemHrefs[label] }));

  // resolve every footer label to a real href: internal routes get store-prefixed,
  // external brand/legal sites open in a new tab.
  const toLink = (label: string) => {
    const dest = footerDest(label);
    return 'url' in dest
      ? { label, href: dest.url, external: true }
      : { label, href: storePath(store, dest.path), external: false };
  };
  const footerColumns = FOOTER_COLUMNS[key].map((c) => ({ heading: c.heading, links: c.links.map(toLink) }));
  const footerSubBrands = FOOTER_SUBBRANDS[key].map((b) => {
    const { href, external } = toLink(b.name);
    return { name: b.name, blurb: b.blurb, href, external };
  });
  const footerLegal = FOOTER_LEGAL[key].map(toLink);

  return (
    <div id="top" className="flex min-h-screen flex-col bg-white">
      <header>
        <HeaderBelt
          store={store}
          cartCount={count}
          userName={user ? firstName(user) : undefined}
          departments={deptLinks}
          programs={programLinks}
          regionSlot={<CountryFlyout countryId={store.id} storeName={store.name} />}
        />
        <SubNav
          items={store.nav.subnav}
          departments={departments}
          departmentHrefs={departments.map(deptHref)}
          itemHrefs={itemHrefs}
          flyout={
            store.id === 'IN'
              ? {
                  item: 'Prime',
                  heading: 'Shopping plans starting at ₹399/year',
                  sub: 'Get FREE same/1-day delivery, Prime offers & more',
                  cta: 'Join Prime Now',
                  href: itemHrefs['Prime'] ?? storePath(store, '/prime'),
                }
              : undefined
          }
        />
      </header>
      <main className="flex-1">{children}</main>
      <Footer
        storeName={store.name}
        tld={store.hostname.split('.').pop()}
        columns={footerColumns}
        locale={FOOTER_LOCALE[key]}
        subBrands={footerSubBrands}
        legal={footerLegal}
        copyright={FOOTER_COPYRIGHT}
      />
    </div>
  );
}

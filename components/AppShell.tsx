import type { ReactNode } from 'react';
import { categories } from '@/lib/catalog';
import { cartCount as readCartCount } from '@/lib/cart';
import { readUser, firstName } from '@/lib/auth';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { LanguageCurrencyFlyout } from './chrome/LanguageCurrencyFlyout';
import { HeaderBelt } from './chrome/HeaderBelt';
import { SubNav } from './chrome/SubNav';
import { Footer } from './chrome/Footer';

const CATALOG_SLUGS = new Set(categories.map((c) => c.slug));

/** department label → catalog category slug (only some departments carry products). */
const DEPT_SLUG: Record<string, string> = {
  Mobiles: 'electronics',
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
  'Customer Service': '/account',
  Registry: '/s',
  'Gift Cards': '/s',
  Sell: '/s',
  Fresh: '/s?dept=home-kitchen',
  Mobiles: '/s?dept=electronics',
  'Prime Video': '/prime-video',
  'Amazon Pay': '/s',
  Bestsellers: '/deals',
  'New Releases': '/s',
  Prime: '/s',
};

/** Footer link columns per marketplace, mirroring the real amazon.com / amazon.in footers. */
const FOOTER_COLUMNS: Record<'US' | 'IN', { heading: string; links: string[] }[]> = {
  US: [
    { heading: 'Get to Know Us', links: ['Careers', 'Blog', 'About Amazon', 'Investor Relations', 'Amazon Devices', 'Amazon Science'] },
    { heading: 'Make Money with Us', links: ['Sell products on Amazon', 'Sell on Amazon Business', 'Sell apps on Amazon', 'Become an Affiliate', 'Advertise Your Products', 'Self-Publish with Us', 'Host an Amazon Hub'] },
    { heading: 'Amazon Payment Products', links: ['Amazon Business Card', 'Shop with Points', 'Reload Your Balance', 'Amazon Currency Converter'] },
    { heading: 'Let Us Help You', links: ['Your Account', 'Your Orders', 'Shipping Rates & Policies', 'Returns & Replacements', 'Help'] },
  ],
  IN: [
    { heading: 'Get to Know Us', links: ['About Us', 'Careers', 'Press Releases', 'Amazon Science'] },
    { heading: 'Connect with Us', links: ['Facebook', 'Twitter', 'Instagram'] },
    { heading: 'Make Money with Us', links: ['Sell on Amazon', 'Sell under Amazon Accelerator', 'Protect and Build Your Brand', 'Amazon Global Selling', 'Become an Affiliate', 'Fulfilment by Amazon', 'Advertise Your Products', 'Amazon Pay on Merchants'] },
    { heading: 'Let Us Help You', links: ['Your Account', 'Returns Centre', '100% Purchase Protection', 'Amazon App Download', 'Help'] },
  ],
};

export interface AppShellProps {
  children: ReactNode;
  cartCount?: number;
}

/** Amazon chrome wrapper: header belt + sub-nav on top, footer below (design.md §5). Store-aware. */
export async function AppShell({ children, cartCount }: AppShellProps) {
  const store = await getMarketplace();
  const count = cartCount ?? (await readCartCount());
  const user = await readUser();

  const departments = store.nav.departments;
  const deptHref = (label: string) => {
    const slug = DEPT_SLUG[label];
    return storePath(store, slug && CATALOG_SLUGS.has(slug) ? `/s?dept=${slug}` : '/s');
  };
  const itemHrefs: Record<string, string> = Object.fromEntries(
    store.nav.subnav.map((item) => [item, storePath(store, ITEM_PATHS[item] ?? '/s')]),
  );

  return (
    <div id="top" className="flex min-h-screen flex-col bg-white">
      <header>
        <HeaderBelt
          store={store}
          cartCount={count}
          userName={user ? firstName(user) : undefined}
          langSlot={
            <LanguageCurrencyFlyout
              storeName={store.name}
              countryId={store.id}
              languages={store.locale.supported.map((l) => l.split('-')[0].toUpperCase())}
              showCurrency={false}
              currencies={[]}
            />
          }
        />
        <SubNav
          items={store.nav.subnav}
          departments={departments}
          departmentHrefs={departments.map(deptHref)}
          itemHrefs={itemHrefs}
        />
      </header>
      <main className="flex-1">{children}</main>
      <Footer storeName={store.name} tld={store.hostname.split('.').pop()} columns={FOOTER_COLUMNS[store.id === 'IN' ? 'IN' : 'US']} />
    </div>
  );
}

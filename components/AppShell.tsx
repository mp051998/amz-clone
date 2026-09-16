import type { ReactNode } from 'react';
import { amazon } from '@/lib/amazon';
import { categories } from '@/lib/catalog';
import { cartCount as readCartCount } from '@/lib/cart';
import { readUser, firstName } from '@/lib/auth';
import { DeliverToPopover } from './chrome/DeliverToPopover';
import { LanguageCurrencyFlyout } from './chrome/LanguageCurrencyFlyout';
import { HeaderBelt } from './chrome/HeaderBelt';
import { SubNav } from './chrome/SubNav';
import { Footer } from './chrome/Footer';

const CATALOG_SLUGS = new Set(categories.map((c) => c.slug));

/** amazon.com department label → catalog category slug (only some departments carry products). */
const DEPT_SLUG: Record<string, string> = {
  Electronics: 'electronics',
  Computers: 'computers',
  'Home & Kitchen': 'home-kitchen',
  Fashion: 'fashion',
  'Beauty & Personal Care': 'beauty',
  Books: 'books',
  'Toys & Games': 'toys',
  'Sports & Outdoors': 'sports',
};

function deptHref(label: string): string {
  const slug = DEPT_SLUG[label];
  return slug && CATALOG_SLUGS.has(slug) ? `/s?dept=${slug}` : '/s';
}

const ITEM_HREFS: Record<string, string> = {
  "Today's Deals": '/deals',
  'Customer Service': '/account',
  Registry: '/s',
  'Gift Cards': '/s',
  Sell: '/s',
};

const FOOTER_COLUMNS = [
  { heading: 'Get to Know Us', links: ['Careers', 'Blog', 'About Amazon', 'Investor Relations', 'Amazon Devices'] },
  { heading: 'Make Money with Us', links: ['Sell products on Amazon', 'Sell on Amazon Business', 'Become an Affiliate', 'Advertise Your Products', 'Self-Publish with Us'] },
  { heading: 'Amazon Payment Products', links: ['Amazon Business Card', 'Shop with Points', 'Reload Your Balance', 'Currency Converter', 'Gift Cards'] },
  { heading: 'Let Us Help You', links: ['Your Account', 'Your Orders', 'Shipping Rates & Policies', 'Returns & Replacements', 'Help'] },
];

export interface AppShellProps {
  children: ReactNode;
  cartCount?: number;
}

/** Amazon chrome wrapper: header belt + sub-nav on top, footer below (design.md §5). */
export async function AppShell({ children, cartCount }: AppShellProps) {
  const count = cartCount ?? (await readCartCount());
  const user = await readUser();
  const departments = amazon.nav.departments;
  return (
    <div id="top" className="flex min-h-screen flex-col bg-white">
      <header>
        <HeaderBelt
          store={amazon}
          cartCount={count}
          userName={user ? firstName(user) : undefined}
          deliverTo={<DeliverToPopover schema="US" postcodeLabel={amazon.address.postcode.label} locationText="Update location" />}
          langSlot={<LanguageCurrencyFlyout storeName={amazon.name} languages={['EN', 'ES', 'ZH', 'DE', 'PT']} showCurrency={false} currencies={[]} />}
        />
        <SubNav
          items={amazon.nav.subnav}
          departments={departments}
          departmentHrefs={departments.map(deptHref)}
          itemHrefs={ITEM_HREFS}
        />
      </header>
      <main className="flex-1">{children}</main>
      <Footer storeName={amazon.name} columns={FOOTER_COLUMNS} />
    </div>
  );
}

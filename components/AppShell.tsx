import type { ReactNode } from 'react';
import { readIsAdmin, readUser, firstName } from '@/lib/auth';
import { storeCategories, viewerCart } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { footerDest } from '@/lib/footer-links';
import { readTheme } from '@/lib/theme-server';
import { CountryFlyout } from './chrome/CountryFlyout';
import { Header } from './chrome/Header';
import { Footer, type FooterColumn, type FooterLink } from './chrome/Footer';
import { ToastProvider } from './decision/Toast';
import { CompareProvider, CompareTray } from './decision/Compare';

export interface AppShellProps {
  children: ReactNode;
  cartCount?: number;
}

/** Program links shown before the catalog departments in the category strip. */
const STRIP_PROGRAMS = [
  { label: "Today's Deals", path: '/deals' },
  { label: 'New & Trending', path: '/new-releases' },
  { label: 'Bestsellers', path: '/bestsellers' },
];

/** Footer columns. `label` → footerDest when `path` is absent (lib/footer-links.ts). */
const FOOTER_COLUMNS: { heading: string; links: { label: string; path?: string; dest?: string }[] }[] = [
  { heading: 'Shop', links: [
    { label: "Today's deals", path: '/deals' },
    { label: 'New & trending', path: '/new-releases' },
    { label: 'Bestsellers', path: '/bestsellers' },
    { label: 'Gift cards', path: '/gift-cards' },
  ] },
  { heading: 'Your things', links: [
    { label: 'Collections', path: '/collections' },
    { label: 'Orders', path: '/orders' },
    { label: 'Cart', path: '/cart' },
    { label: 'Account', path: '/account' },
  ] },
  { heading: 'Help', links: [
    { label: 'Customer service', dest: 'Help' },
    { label: 'Returns & replacements', dest: 'Returns & Replacements' },
    { label: 'Shipping & delivery', dest: 'Shipping Rates & Policies' },
    { label: 'Product safety', dest: 'Recalls and Product Safety Alerts' },
  ] },
  { heading: 'Work with us', links: [
    { label: 'Sell with us', dest: 'Sell on Amazon' },
    { label: 'Business', dest: 'Amazon Business' },
    { label: 'Membership', path: '/prime' },
    { label: 'Pay', path: '/amazon-pay' },
  ] },
];

const FOOTER_LEGAL: Record<'US' | 'IN', string[]> = {
  US: ['Conditions of Use', 'Privacy Notice', 'Your Ads Privacy Choices'],
  IN: ['Conditions of Use & Sale', 'Privacy Notice', 'Interest-Based Ads'],
};

/**
 * Page chrome for every storefront route (design.md §6 Layout): sticky header + category strip,
 * content, calm footer, and the global toast + compare tray. Store-aware (US at /, IN at /in).
 */
export async function AppShell({ children, cartCount }: AppShellProps) {
  const store = await getMarketplace();
  const [cart, user, categories, admin] = await Promise.all([viewerCart(), readUser(), storeCategories(), readIsAdmin()]);
  const count = cartCount ?? cart.count;
  const key = store.id === 'IN' ? 'IN' : 'US';

  const strip = [
    ...STRIP_PROGRAMS.map((p) => ({ label: p.label, href: storePath(store, p.path) })),
    ...categories.map((c) => ({ label: c.name, href: storePath(store, `/s?dept=${encodeURIComponent(c.slug)}`) })),
  ];

  const resolve = (label: string, destLabel: string): FooterLink => {
    const dest = footerDest(destLabel);
    return 'url' in dest ? { label, href: dest.url, external: true } : { label, href: storePath(store, dest.path) };
  };
  const columns: FooterColumn[] = FOOTER_COLUMNS.map((c) => ({
    heading: c.heading,
    links: c.links.map((l) => (l.path ? { label: l.label, href: storePath(store, l.path) } : resolve(l.label, l.dest ?? l.label))),
  }));
  const legal = FOOTER_LEGAL[key].map((l) => resolve(l, l));
  const stores = [
    { id: 'US' as const, label: 'United States', meta: 'USD', href: '/', current: key === 'US' },
    { id: 'IN' as const, label: 'India', meta: 'INR', href: '/in', current: key === 'IN' },
  ];

  return (
    <ToastProvider>
      <CompareProvider market={store.id}>
        <div id="top" className="flex min-h-screen flex-col bg-bg">
          <a href="#main" className="sr-only z-[90] rounded-pill bg-ink px-4 py-2 text-on-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-3">Skip to content</a>
          <Header
            store={store}
            cartCount={count}
            userName={user ? firstName(user) : undefined}
            isAdmin={admin}
            categories={strip}
            regionSlot={<CountryFlyout countryId={store.id} storeName={store.name} />}
          />
          <main id="main" className="flex-1">{children}</main>
          <Footer storeName={store.name} columns={columns} stores={stores} legal={legal} homeHref={storePath(store, '/')} theme={await readTheme()} />
          <CompareTray />
        </div>
      </CompareProvider>
    </ToastProvider>
  );
}

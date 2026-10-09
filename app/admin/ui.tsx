import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision/Badges';
import { Pill } from '@/components/decision/Pill';
import { PageHead, pageX } from '@/components/brand/Page';
import type { ProductFormValues } from '@/components/admin/ProductForm';
import type { PublicMarketplace } from '@/lib/contracts';
import type { AdminProduct } from '@/lib/data/admin-catalog';
import { detailLines } from '@/lib/product-details';
import { storePath } from '@/lib/marketplace';
import { unitSizeText } from '@/lib/unit-price';
import { localDayOf } from '@/lib/decision/tracking';
import { cn } from '@/components/lib/cn';

const STORE_LABEL = { US: 'United States store', IN: 'India store' } as const;

const SECTIONS = [
  { path: '/admin', label: 'Overview' },
  { path: '/admin/products', label: 'Products' },
  { path: '/admin/categories', label: 'Categories' },
  { path: '/admin/small-businesses', label: 'Small businesses' },
  { path: '/admin/orders', label: 'Orders' },
  { path: '/admin/sales', label: 'Sales' },
  { path: '/admin/deals', label: 'Deals' },
  { path: '/admin/returns', label: 'Returns' },
  { path: '/admin/claims', label: 'Claims' },
  { path: '/admin/trade-ins', label: 'Trade-ins' },
  { path: '/admin/reviews', label: 'Reviews' },
  { path: '/admin/questions', label: 'Questions' },
  { path: '/admin/product-reports', label: 'Reports' },
  { path: '/admin/support', label: 'Support' },
] as const;

/** Admin page chrome: storefront shell, section tabs, "Admin · <store>" kicker, title, and a store switch. */
export function AdminFrame({ store, title, actions, lede, children, path }: {
  store: PublicMarketplace;
  title: string;
  actions?: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  /** base path of this page, for the link to the same page in the other store. */
  path: string;
}) {
  const other = store.id === 'IN' ? 'US' : 'IN';
  return (
    <AppShell>
      <div className={cn(pageX, 'flex flex-col gap-6 pb-16 pt-5')}>
        <nav aria-label="Admin" className="flex gap-5 overflow-x-auto border-b border-line text-[15px]">
          {SECTIONS.map((sec) => {
            // the overview is /admin itself; every other section owns the paths under it
            const current = sec.path === '/admin' ? path === '/admin' : path.startsWith(sec.path);
            return (
              <a
                key={sec.path}
                href={storePath(store, sec.path)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px flex min-h-11 flex-none items-center whitespace-nowrap border-b-2 no-underline',
                  current ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink',
                )}
              >
                {sec.label}
              </a>
            );
          })}
        </nav>
        <PageHead
          kicker={
            <>
              Admin · {STORE_LABEL[store.id]} ·{' '}
              <a href={storePath({ id: other }, path)} className="text-ink underline underline-offset-2">Switch to {STORE_LABEL[other]}</a>
            </>
          }
          title={title}
          actions={actions}
        >
          {lede}
        </PageHead>
        {children}
      </div>
    </AppShell>
  );
}

/** Pill tabs that filter the page (e.g. On sale / Archived). */
export function AdminTabs({ label, tabs }: { label: string; tabs: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map((t) => <Pill key={t.href} href={t.href} selected={t.current}>{t.label}</Pill>)}
    </nav>
  );
}

/** Signed in, but not an admin. */
export function AdminOnly({ store }: { store: PublicMarketplace }) {
  return (
    <AppShell>
      <div className={cn(pageX, 'pb-16 pt-10')}>
        <EmptyState
          title="This area is for store admins."
          action={<a href={storePath(store, '/')} className="text-[15px] underline underline-offset-2">Back to the store</a>}
        >
          Your account doesn’t have admin access. Ask an existing admin to add you.
        </EmptyState>
      </div>
    </AppShell>
  );
}

/** Minor units → the text an admin types (19.99; whole amounts without decimals). */
export function majorText(minor: number | null | undefined): string {
  if (minor == null) return '';
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/** A saved product as product-form strings. */
export function productFormValues(p: AdminProduct, timeZone: string): ProductFormValues {
  return {
    title: p.title,
    brand: p.brand ?? '',
    category: p.category,
    image: p.image,
    price: majorText(p.priceMinor),
    listPrice: majorText(p.listMinor),
    deal: p.deal,
    coupon: p.couponPct == null ? '' : String(p.couponPct),
    limit: p.maxPerCustomer == null ? '' : String(p.maxPerCustomer),
    sizes: p.sizes?.join(', ') ?? '',
    climate: (p.climate ?? []).join(','),
    unit: p.unit ? unitSizeText(p.unit) : '',
    qtyPct: p.qtyDiscount ? String(p.qtyDiscount.percentOff) : '',
    qtyMin: p.qtyDiscount ? String(p.qtyDiscount.minQty) : '',
    member: p.memberPct == null ? '' : String(p.memberPct),
    release: p.releaseAt ? localDayOf(p.releaseAt, timeZone) : '',
    badge: p.badge ?? '',
    seller: p.seller,
    shipsFrom: p.shipsFrom,
    bullets: p.bullets.join('\n'),
    description: p.description ?? '',
    details: detailLines(p.details),
    stock: String(p.stock),
    gallery: p.gallery.join('\n'),
    variantGroup: p.variantGroup ?? '',
    variantAxis: p.variantAxis ?? '',
    variantLabel: p.variantLabel ?? '',
  };
}

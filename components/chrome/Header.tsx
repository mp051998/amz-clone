import type { ReactNode } from 'react';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { Wordmark } from './Wordmark';
import { SearchBar } from './SearchBar';
import { DeliverToPopover } from './DeliverToPopover';
import { AccountMenu } from './AccountMenu';
import { CategoryStrip, type CategoryLink } from './CategoryStrip';

export interface HeaderProps {
  store: Store;
  cartCount?: number;
  /** first name of the signed-in user; undefined when signed out. */
  userName?: string;
  /** category strip links (already store-prefixed). */
  categories?: CategoryLink[];
  /** store switch trigger (desktop, lg+). */
  regionSlot?: ReactNode;
  defaultQuery?: string;
}

function CartPill({ href, count, compact = false }: { href: string; count: number; compact?: boolean }) {
  return (
    <a
      href={href}
      aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}
      className={`flex flex-none items-center gap-2 rounded-pill border border-line text-[14px] font-semibold text-ink no-underline hover:border-ink hover:text-ink ${compact ? 'min-h-11 gap-1.5 px-3' : 'min-h-10 px-3.5'}`}
    >
      Cart
      <span aria-hidden className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] bg-accent px-1.5 text-[12px] tabular-nums">{count}</span>
    </a>
  );
}

/** Sticky white header: desktop row, mobile stack, category strip (design.md §5 Header). Store-aware. */
export function Header({ store, cartCount = 0, userName, categories = [], regionSlot, defaultQuery }: HeaderProps) {
  const home = storePath(store, '/');
  const action = storePath(store, '/s');
  const locationText = store.id === 'IN' ? 'Bengaluru 560001' : 'Update location';
  const deliver = { schema: store.address.schema, postcodeLabel: store.address.postcode.label, locationText };
  const savedHref = storePath(store, userName ? '/collections' : '/signin');
  const ordersHref = storePath(store, '/orders');
  const cartHref = storePath(store, '/cart');
  const navLink = 'flex min-h-11 flex-none items-center rounded-chip px-2 text-[14px] font-semibold text-ink no-underline hover:bg-surface-2 hover:text-ink';

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface">
      {/* desktop */}
      <div className="mx-auto hidden max-w-page items-center gap-5 px-6 py-3 md:flex">
        <a href={home} aria-label={`${store.name} demo store home`} className="flex-none no-underline"><Wordmark /></a>
        <DeliverToPopover {...deliver} />
        <SearchBar actionPath={action} defaultQuery={defaultQuery} />
        {regionSlot ? <div className="hidden lg:block">{regionSlot}</div> : null}
        <AccountMenu store={store} userName={userName} />
        <a href={ordersHref} className={navLink}>Orders</a>
        <CartPill href={cartHref} count={cartCount} />
      </div>

      {/* mobile */}
      <div className="flex flex-col gap-2.5 px-4 pb-3 pt-2.5 md:hidden">
        <div className="flex items-center gap-2">
          <a href={home} aria-label={`${store.name} demo store home`} className="no-underline"><Wordmark size="sm" /></a>
          <div className="flex-1" />
          <a href={savedHref} className={navLink}>Saved</a>
          <a href={ordersHref} className={navLink}>Orders</a>
          <CartPill href={cartHref} count={cartCount} compact />
        </div>
        <SearchBar actionPath={action} defaultQuery={defaultQuery} placeholder="Search or describe what you need" />
        <DeliverToPopover {...deliver} layout="inline" userName={userName} />
      </div>

      <CategoryStrip links={categories} />
    </header>
  );
}

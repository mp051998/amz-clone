'use client';
import type { ReactNode } from 'react';
import type { Store } from '../lib/store';
import { categories } from '@/lib/catalog';
import { storePath } from '@/lib/marketplace';
import { IconCart } from '../icons/index';
import { SearchBar } from './SearchBar';
import { Wordmark } from './Wordmark';
import { DeliverToPopover } from './DeliverToPopover';
import { AccountMenu } from './AccountMenu';

export interface HeaderBeltProps {
  store: Store;
  cartCount?: number;
  /** first name of the signed-in user; undefined when signed out. */
  userName?: string;
  /** slot for the language/currency flyout trigger (desktop only). */
  langSlot?: ReactNode;
}

/** 60px belt: wordmark, deliver-to, search, language, account, orders, cart (design.md §5 Header belt). */
export function HeaderBelt({ store, cartCount = 0, userName, langSlot }: HeaderBeltProps) {
  const tld = store.hostname.split('.').pop();
  const searchDepts = [{ label: 'All', value: '' }, ...categories.map((c) => ({ label: c.name, value: c.slug }))];
  const search = <SearchBar storeName={store.name} departments={searchDepts} actionPath={storePath(store, '/s')} />;
  const locationText = store.id === 'IN' ? 'Bengaluru 560001' : 'Update location';
  const deliverTo = (
    <DeliverToPopover schema={store.address.schema} postcodeLabel={store.address.postcode.label} locationText={locationText} />
  );

  return (
    <div className="bg-nav-belt text-white">
      <div className="mx-auto max-w-[1500px] px-2 sm:px-3">
        <div className="flex h-[60px] items-center gap-1 sm:gap-2">
          <a href={storePath(store, '/')} aria-label={store.name} className="shrink-0 rounded-[3px] px-1 py-1 hover:outline hover:outline-1 hover:outline-white sm:px-2"><Wordmark tld={tld} /></a>
          <div className="hidden md:block">{deliverTo}</div>
          {/* inline search on md+ */}
          <div className="hidden min-w-0 flex-1 md:flex">{search}</div>
          {/* spacer: on mobile the search moves to its own row, so push actions to the right */}
          <div className="flex-1 md:hidden" />
          {langSlot ? <div className="hidden md:block">{langSlot}</div> : null}
          {/* account: two-line on desktop, compact on mobile — flyout on md+ */}
          <AccountMenu store={store} userName={userName} />
          <a href={storePath(store, '/orders')} className="hidden shrink-0 rounded-[3px] px-2 py-1 leading-[14px] hover:outline hover:outline-1 hover:outline-white md:block">
            <span className="text-[12px]">Returns</span>
            <div className="text-[14px] font-bold">&amp; Orders</div>
          </a>
          <a href={storePath(store, '/cart')} aria-label={`Cart, ${cartCount} items`} className="flex shrink-0 items-end gap-1 rounded-[3px] px-1 py-1 hover:outline hover:outline-1 hover:outline-white sm:px-2">
            <span className="relative">
              <IconCart aria-label="Cart" width={34} height={34} />
              <span className="absolute -top-1 left-4 text-[16px] font-bold text-brand-count">{cartCount}</span>
            </span>
            <span className="text-[14px] font-bold">Cart</span>
          </a>
        </div>
        {/* full-width search on its own row, phones only */}
        <div className="pb-2 md:hidden">{search}</div>
      </div>
      {/* location bar: phones only, mirrors amazon's mobile "deliver to" strip */}
      <div className="border-t border-white/10 bg-nav-main px-1 md:hidden">{deliverTo}</div>
    </div>
  );
}

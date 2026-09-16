'use client';
import type { ReactNode } from 'react';
import type { Store } from '../lib/store';
import { IconCart } from '../icons/index';
import { SearchBar } from './SearchBar';
import { Wordmark } from './Wordmark';

export interface HeaderBeltProps {
  store: Store;
  cartCount?: number;
  /** slot rendered in the location area — DeliverToPopover trigger is injected here by the app. */
  deliverTo?: ReactNode;
  /** slot for the language/currency flyout trigger. */
  langSlot?: ReactNode;
}

/** 60px belt: wordmark, deliver-to, search, language, account, orders, cart (design.md §5 Header belt). */
export function HeaderBelt({ store, cartCount = 0, deliverTo, langSlot }: HeaderBeltProps) {
  const tld = store.hostname.split('.').pop();
  const departments = ['All', ...store.nav.departments.slice(0, 6)];
  return (
    <div className="bg-nav-belt text-white">
      <div className="mx-auto flex h-[60px] max-w-[1500px] items-center gap-1 px-3">
        <a href="/" aria-label={store.name} className="rounded-[3px] px-2 py-1 hover:outline hover:outline-1 hover:outline-white"><Wordmark tld={tld} /></a>
        {deliverTo ? <div className="hidden md:block">{deliverTo}</div> : null}
        <SearchBar storeName={store.name} departments={departments} />
        {langSlot ? <div className="hidden md:block">{langSlot}</div> : null}
        <a href="/account" className="hidden rounded-[3px] px-2 py-1 leading-[14px] hover:outline hover:outline-1 hover:outline-white md:block">
          <span className="text-[12px]">Hello, sign in</span>
          <div className="text-[14px] font-bold">Account &amp; Lists</div>
        </a>
        <a href="/orders" className="hidden rounded-[3px] px-2 py-1 leading-[14px] hover:outline hover:outline-1 hover:outline-white md:block">
          <span className="text-[12px]">Returns</span>
          <div className="text-[14px] font-bold">&amp; Orders</div>
        </a>
        <a href="/cart" aria-label={`Cart, ${cartCount} items`} className="flex items-end gap-1 rounded-[3px] px-2 py-1 hover:outline hover:outline-1 hover:outline-white">
          <span className="relative">
            <IconCart aria-label="Cart" width={34} height={34} />
            <span className="absolute -top-1 left-4 text-[16px] font-bold text-brand-count">{cartCount}</span>
          </span>
          <span className="text-[14px] font-bold">Cart</span>
        </a>
      </div>
    </div>
  );
}

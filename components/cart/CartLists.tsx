import type { ReactNode } from 'react';
import type { BuyAgainItem } from '@/lib/buy-again';
import type { PublicMarketplace } from '@/lib/contracts';
import type { CollectionItem } from '@/lib/decision/types';
import { storePath } from '@/lib/marketplace';
import type { Product } from '@/lib/types';
import { cn } from '../lib/cn';
import { BuyItAgain } from './BuyItAgain';
import { SavedForLater } from './SavedForLater';

export type CartList = 'later' | 'again';

/** The list picked under the cart (`list=again`), Saved for later otherwise. */
export function cartList(v: string | string[] | undefined): CartList {
  return (Array.isArray(v) ? v[0] : v) === 'again' ? 'again' : 'later';
}

export interface CartListsProps {
  /** the shopper's "Saved for later" list, if they have one */
  later: { collectionId: string; items: CollectionItem[] } | null;
  /** what they can buy again (not already in the cart) */
  again: (BuyAgainItem & { product: Product })[];
  /** more to buy again than is shown */
  moreAgain: boolean;
  view: CartList;
  store: PublicMarketplace;
}

/**
 * Under the cart, Amazon's "Saved for later | Buy it again" tabs. The tabs are links
 * (`/cart`, `/cart?list=again`), so they work before the page's scripts load; with only one of
 * the lists to show, it shows on its own under its heading.
 */
export function CartLists({ later, again, moreAgain, view, store }: CartListsProps) {
  const sp = (path: string) => storePath(store, path);
  const saved = later?.items ?? [];
  if (!again.length) return later ? <SavedForLater collectionId={later.collectionId} items={saved} sp={sp} /> : null;
  if (!later || !saved.length) return <BuyItAgain items={again} more={moreAgain} store={store} />;
  const tab = (key: CartList, path: string, label: ReactNode) => (
    <a
      href={sp(path)}
      aria-current={view === key ? 'page' : undefined}
      className={cn(
        '-mb-px flex-none whitespace-nowrap border-b-2 px-1 pb-2 text-[17px] no-underline',
        view === key ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink',
      )}
    >
      {label}
    </a>
  );
  return (
    <div id="your-lists" className="flex scroll-mt-[128px] flex-col gap-2.5">
      <nav aria-label="Saved for later and Buy it again" className="flex max-w-full gap-5 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {tab(
          'later',
          '/cart#your-lists',
          <>
            Saved for later <span className="font-normal text-ink-3">({saved.length} {saved.length === 1 ? 'item' : 'items'})</span>
          </>,
        )}
        {tab('again', '/cart?list=again#your-lists', 'Buy it again')}
      </nav>
      {view === 'again' ? (
        <BuyItAgain items={again} more={moreAgain} store={store} titled={false} />
      ) : (
        <SavedForLater collectionId={later.collectionId} items={saved} sp={sp} titled={false} />
      )}
    </div>
  );
}

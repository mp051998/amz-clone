import { ContinueRow } from '@/components/home/HomeSections';
import type { Store } from '@/components/lib/store';
import { storePath } from '@/lib/marketplace';
import type { Product } from '@/lib/types';

/** "Your browsing history" row closing the product, cart and search results pages (hidden when empty). */
export function BrowsingHistory({ products, store }: { products: Product[]; store: Store }) {
  if (!products.length) return null;
  return (
    <section aria-labelledby="history-h" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="history-h" className="m-0 text-[22px] font-semibold">Your browsing history</h2>
        <a href={storePath(store, '/history')} className="text-[14px] text-ink underline underline-offset-2">See all</a>
      </div>
      <ContinueRow products={products} store={store} />
    </section>
  );
}

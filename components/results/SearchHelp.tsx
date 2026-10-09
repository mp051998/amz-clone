import type { PublicMarketplace } from '@/lib/contracts';
import { storePath } from '@/lib/marketplace';

/**
 * The foot of the search results, as on Amazon: a note that options can change the price (when
 * there are results) and "Need help? Visit the help section or contact us".
 */
export function SearchHelp({ store, results }: { store: Pick<PublicMarketplace, 'id'>; results: boolean }) {
  const colour = store.id === 'IN' ? 'colour' : 'color';
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4 text-[14px] text-ink-2">
      {results ? (
        <p className="m-0 text-[13px] text-ink-3">Check each product page for other buying options. Price and other details may vary based on product size and {colour}.</p>
      ) : null}
      <section aria-labelledby="search-help-h" className="flex flex-col gap-1">
        <h2 id="search-help-h" className="m-0 text-[16px] font-semibold text-ink">Need help?</h2>
        <p className="m-0">
          Visit the <a href={storePath(store, '/customer-service')} className="text-ink underline underline-offset-2">help section</a> or{' '}
          <a href={storePath(store, '/customer-service/contact')} className="text-ink underline underline-offset-2">contact us</a>
        </p>
      </section>
    </div>
  );
}

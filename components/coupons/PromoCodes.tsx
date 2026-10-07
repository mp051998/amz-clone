import type { PromoOffer } from '@/lib/data/promo';
import { formatMoney } from '@/lib/marketplaces';
import type { Store } from '../lib/store';

/** "Ends Oct 31" in the store's own calendar. */
function endsOn(iso: string, store: Store): string {
  return new Intl.DateTimeFormat(store.locale.default, { month: 'short', day: 'numeric', timeZone: store.dates.timeZone }).format(new Date(iso));
}

/** The promotion codes a store is running, to type in at checkout. */
export function PromoCodes({ promos, store }: { promos: PromoOffer[]; store: Store }) {
  if (!promos.length) return null;
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  return (
    <section aria-labelledby="promo-codes" className="flex flex-col gap-3">
      <div>
        <h2 id="promo-codes" className="m-0 text-[18px] font-semibold">Promotion codes</h2>
        <p className="m-0 mt-1 text-[14px] text-ink-2">Enter a code under “Add a promotion code” at checkout. One per order, each once per customer.</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {promos.map((p) => (
          <li key={p.code} className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[16px] font-semibold tracking-wide">{p.code}</span>
              <span className="text-[14px] font-semibold">{p.percentOff}% off</span>
            </div>
            <p className="m-0 text-[14px]">{p.description}</p>
            <p className="m-0 text-[13px] text-ink-3">
              {p.category ? <>{p.category.name} only</> : <>Everything in the store</>}
              {p.minSpendMinor > 0 ? <> · Spend {money(p.minSpendMinor)}+</> : null}
              {p.endsAt ? <> · Ends {endsOn(p.endsAt, store)}</> : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

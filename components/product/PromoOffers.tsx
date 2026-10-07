import type { PromoOffer } from '@/lib/data/promo';
import { formatMoney } from '@/lib/marketplaces';
import type { CurrencyCode } from '@/lib/contracts';

/**
 * Amazon's "Promotion available" line under the price: each code that takes money off this
 * product at checkout, with its department and minimum spend, and a link to every promotion.
 */
export function PromoOffers({ promos, currency, allHref }: { promos: readonly PromoOffer[]; currency: CurrencyCode; allHref: string }) {
  if (!promos.length) return null;
  const money = (minor: number) => formatMoney(minor, currency);
  return (
    <ul aria-label="Promotions" className="m-0 flex list-none flex-col gap-0.5 p-0 text-[14px]">
      {promos.map((p) => (
        <li key={p.code}>
          <span className="mr-1.5 rounded-tag bg-good-bg px-1 py-px text-[11px] font-bold text-good-strong">Promotion</span>
          Save <strong className="font-semibold">{p.percentOff}%</strong>
          {p.category ? <> on {p.category.name}</> : null} with code <strong className="font-mono font-semibold">{p.code}</strong> at checkout
          {p.minSpendMinor > 0 ? <span className="text-ink-2"> (spend {money(p.minSpendMinor)}+)</span> : null}.{' '}
          <a href={allHref} className="text-ink underline underline-offset-2 hover:text-accent-ink">Terms</a>
        </li>
      ))}
    </ul>
  );
}

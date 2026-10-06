import type { Store } from '../lib/store';
import { Stars } from '../primitives/Stars';
import { PERIOD_LABELS, pctOf, type SellerProfile } from '@/lib/data/seller-feedback';

const num = (n: number) => n.toLocaleString('en-US');
const STARS = [5, 4, 3, 2, 1] as const;

/** 12-month average stars from the per-star counts, one decimal. */
export function averageStars(stars: SellerProfile['stars']): number {
  const total = STARS.reduce((s, n) => s + stars[n], 0);
  return total ? Math.round((STARS.reduce((s, n) => s + n * stars[n], 0) / total) * 10) / 10 : 0;
}

/**
 * The ratings half of a seller's page: the 12-month headline and star bars, the
 * positive/neutral/negative table by period, and the latest comments.
 */
export function SellerRatings({ profile, store }: { profile: SellerProfile; store: Pick<Store, 'dates' | 'locale'> }) {
  const year = profile.periods.find((p) => p.period === '12m');
  const total = year?.ratings ?? 0;
  const lifetime = profile.periods.find((p) => p.period === 'all')?.ratings ?? 0;
  const date = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone });

  return (
    <section aria-labelledby="seller-ratings-h" className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-[22px]">
      <h2 id="seller-ratings-h" className="m-0 text-[18px] font-semibold">Seller ratings</h2>
      {total ? (
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <div className="flex min-w-[220px] flex-col gap-1.5">
            <Stars rating={averageStars(profile.stars)} size={18} showValue />
            <strong className="text-[16px] font-semibold">{pctOf(year!.positive, total)}% positive in the last 12 months</strong>
            <span className="text-[14px] text-ink-2">{num(total)} {total === 1 ? 'rating' : 'ratings'}</span>
            <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0" aria-label="Rating distribution, last 12 months">
              {STARS.map((n) => {
                const pct = pctOf(profile.stars[n], total);
                return (
                  <li key={n} className="flex min-h-6 items-center gap-2 text-[13px] text-ink" aria-label={`${n} ${n === 1 ? 'star' : 'stars'}: ${pct}%`}>
                    <span aria-hidden className="w-[22px] tabular-nums">{n}★</span>
                    <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-tag bg-surface-4">
                      <span className="block h-full bg-ink" style={{ width: `${pct}%` }} />
                    </span>
                    <span aria-hidden className="w-[38px] text-right text-ink-2 tabular-nums">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="min-w-0 flex-[1_1_320px] overflow-x-auto">
            <table className="w-full border-collapse text-[14px] tabular-nums">
              <caption className="sr-only">Ratings by period</caption>
              <thead>
                <tr className="text-ink-2">
                  <td />
                  {profile.periods.map((p) => (
                    <th key={p.period} scope="col" className="px-2 pb-2 text-right font-semibold">{PERIOD_LABELS[p.period]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Positive', 'positive'],
                    ['Neutral', 'neutral'],
                    ['Negative', 'negative'],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key} className="border-t border-line-2">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2">{label}</th>
                    {profile.periods.map((p) => (
                      <td key={p.period} className="px-2 py-1.5 text-right">{p.ratings ? `${pctOf(p[key], p.ratings)}%` : '—'}</td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-line-2">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2">Count</th>
                  {profile.periods.map((p) => (
                    <td key={p.period} className="px-2 py-1.5 text-right">{num(p.ratings)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="m-0 mt-2 text-[13px] text-ink-3">Positive: 4 or 5 stars. Neutral: 3. Negative: 1 or 2.</p>
          </div>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-ink-2">
          {lifetime ? 'No ratings in the last 12 months.' : 'No ratings yet.'} Shoppers can rate a seller from their order once it arrives.
        </p>
      )}

      {profile.recent.length ? (
        <div className="flex flex-col">
          <h3 className="m-0 mb-1 text-[16px] font-semibold">What shoppers said</h3>
          <ul className="m-0 list-none p-0">
            {profile.recent.map((r, i) => {
              const notes = [
                r.arrivedOnTime === true ? 'Arrived on time' : r.arrivedOnTime === false ? 'Arrived late' : null,
                r.asDescribed === true ? 'As described' : r.asDescribed === false ? 'Not as described' : null,
              ].filter(Boolean);
              return (
                <li key={i} className="flex flex-col gap-1 border-t border-line-2 py-3 first:border-t-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Stars rating={r.rating} size={14} />
                    <span className="text-[13px] text-ink-3">{date.format(new Date(r.createdAt))} · Verified order</span>
                  </div>
                  <p className="m-0 whitespace-pre-line text-[14px] text-ink">{r.comment}</p>
                  {notes.length ? <span className="text-[13px] text-ink-2">{notes.join(' · ')}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

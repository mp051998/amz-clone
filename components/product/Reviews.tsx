import type { Product } from '@/lib/catalog';
import { Stars } from '../primitives/Stars';
import { ratingBreakdown, productReviews } from '@/lib/reviews';

/** PDP customer-reviews block: rating summary + histogram on the left, written reviews on the right. */
export function Reviews({ product: p }: { product: Product }) {
  const bars = ratingBreakdown(p);
  const reviews = productReviews(p);
  const ratingText = Number.isInteger(p.rating) ? String(p.rating) : p.rating.toFixed(1);

  return (
    <section id="reviews" className="mt-10 scroll-mt-[120px] border-t border-line pt-6">
      <h2 className="text-[21px] font-bold text-ink">Customer reviews</h2>
      <div className="mt-4 flex flex-col gap-8 lg:flex-row">
        {/* Summary + histogram */}
        <aside className="lg:w-[300px] lg:shrink-0">
          <div className="flex items-center gap-2">
            <Stars rating={p.rating} size={18} />
            <span className="text-[16px] text-ink">{ratingText} out of 5</span>
          </div>
          <p className="mt-1 text-[14px] text-ink-2">{p.reviewCount.toLocaleString('en-US')} global ratings</p>

          <div className="mt-4 space-y-1.5">
            {bars.map((b) => (
              <div key={b.star} className="flex items-center gap-3 text-[14px]">
                <span className="w-[52px] shrink-0 text-link-teal hover:text-link-hover hover:underline">{b.star} star</span>
                <span className="h-[22px] flex-1 overflow-hidden rounded-[4px] border border-line-3 bg-surface-2" aria-hidden>
                  <span className="block h-full bg-cta-orange" style={{ width: `${b.pct}%` }} />
                </span>
                <span className="w-[36px] shrink-0 text-right text-link-teal">{b.pct}%</span>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <h3 className="text-[17px] font-bold text-ink">Review this product</h3>
            <p className="mt-1 text-[13px] text-ink-2">Share your thoughts with other customers</p>
            <a href="#reviews" className="mt-3 flex h-[32px] w-full items-center justify-center rounded-pill border border-line-3 bg-white text-[13px] text-ink shadow-input hover:bg-surface-2">
              Write a customer review
            </a>
          </div>
        </aside>

        {/* Written reviews */}
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold text-ink">Top reviews from the United States</h3>
          <ul className="mt-4 divide-y divide-line-soft">
            {reviews.map((r) => (
              <li key={r.id} className="py-5 first:pt-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[13px] font-bold text-ink-2">{r.initial}</span>
                  <span className="text-[13px] text-ink">{r.author}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Stars rating={r.rating} size={16} />
                  <a href="#reviews" className="text-[14px] font-bold text-ink hover:text-link-hover hover:underline">{r.title}</a>
                </div>
                <p className="mt-1 text-[13px] text-ink-2">
                  Reviewed in the United States on {r.date}
                </p>
                {r.verified ? <p className="mt-1 text-[13px] font-bold text-warn">Verified Purchase</p> : null}
                <p className="mt-2 text-[14px] leading-5 text-ink">{r.body}</p>
                {r.helpful > 0 ? (
                  <p className="mt-2 text-[13px] text-ink-2">
                    {r.helpful.toLocaleString('en-US')} {r.helpful === 1 ? 'person' : 'people'} found this helpful
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex h-[29px] items-center rounded-pill border border-line-3 bg-white px-5 text-[13px] text-ink shadow-input">Helpful</span>
                  <span className="text-[12px] text-ink-4">|</span>
                  <span className="text-[13px] text-ink-2 hover:text-link-hover hover:underline">Report</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Product } from '@/lib/catalog';
import { Stars } from '../primitives/Stars';
import { ratingBreakdown, productReviews, type Review } from '@/lib/reviews';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const todayLabel = () => {
  const d = new Date();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/** Clickable 1–5 star picker for the write-review form. */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="p-0.5 text-[22px] leading-none"
        >
          <span className={n <= shown ? 'text-star' : 'text-line-2'}>★</span>
        </button>
      ))}
    </div>
  );
}

/** PDP customer-reviews block: rating summary + histogram on the left, written reviews on the right.
 *  Interactive: write a review (stored per-viewer in localStorage), mark reviews helpful, report a review. */
export function Reviews({ product: p, country = 'the United States' }: { product: Product; country?: string }) {
  const bars = ratingBreakdown(p);
  const baseReviews = useMemo(() => productReviews(p), [p]);
  const ratingText = Number.isInteger(p.rating) ? String(p.rating) : p.rating.toFixed(1);

  const reviewsKey = `amz_reviews_${p.id}`;
  const helpfulKey = 'amz_review_helpful';
  const reportedKey = 'amz_review_reported';

  const [userReviews, setUserReviews] = useState<Review[]>([]);
  const [helpful, setHelpful] = useState<Record<string, boolean>>({});
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ rating: 0, title: '', body: '', name: '' });
  const [error, setError] = useState('');

  // hydrate viewer-local state after mount (keeps first render matching SSR)
  useEffect(() => {
    setUserReviews(safeParse<Review[]>(localStorage.getItem(reviewsKey), []));
    setHelpful(safeParse<Record<string, boolean>>(localStorage.getItem(helpfulKey), {}));
    setReported(safeParse<Record<string, boolean>>(localStorage.getItem(reportedKey), {}));
  }, [reviewsKey]);

  const persist = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — keep state in memory only */
    }
  };

  const toggleHelpful = (id: string) => {
    setHelpful((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id]) delete next[id];
      persist(helpfulKey, next);
      return next;
    });
  };

  const report = (id: string) => {
    setReported((prev) => {
      const next = { ...prev, [id]: true };
      persist(reportedKey, next);
      return next;
    });
  };

  const submitReview = () => {
    if (!form.rating) return setError('Please select a star rating.');
    if (!form.title.trim() || !form.body.trim()) return setError('Please add a headline and a review.');
    const review: Review = {
      id: `user-${Date.now()}`,
      author: form.name.trim() || 'You',
      initial: (form.name.trim() || 'You').charAt(0).toUpperCase(),
      rating: form.rating,
      title: form.title.trim(),
      body: form.body.trim(),
      date: todayLabel(),
      verified: true,
      helpful: 0,
    };
    const next = [review, ...userReviews];
    setUserReviews(next);
    persist(reviewsKey, next);
    setForm({ rating: 0, title: '', body: '', name: '' });
    setError('');
    setShowForm(false);
  };

  const allReviews = [...userReviews, ...baseReviews];

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
                <span className="w-[52px] shrink-0 text-link-teal">{b.star} star</span>
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
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              aria-expanded={showForm}
              className="mt-3 flex h-[32px] w-full items-center justify-center rounded-pill border border-line-3 bg-white text-[13px] text-ink shadow-input hover:bg-surface-2"
            >
              Write a customer review
            </button>

            {showForm ? (
              <div className="mt-4 rounded-[8px] border border-line bg-white p-4">
                <label className="block text-[13px] font-bold text-ink">Overall rating</label>
                <div className="mt-1"><StarPicker value={form.rating} onChange={(n) => setForm((f) => ({ ...f, rating: n }))} /></div>

                <label className="mt-3 block text-[13px] font-bold text-ink" htmlFor="rv-name">Name (optional)</label>
                <input id="rv-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={40}
                  className="mt-1 h-[34px] w-full rounded-[6px] border border-line-2 px-2 text-[14px] text-ink outline-none focus:border-brand-orange" />

                <label className="mt-3 block text-[13px] font-bold text-ink" htmlFor="rv-title">Add a headline</label>
                <input id="rv-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={100}
                  placeholder="What's most important to know?"
                  className="mt-1 h-[34px] w-full rounded-[6px] border border-line-2 px-2 text-[14px] text-ink outline-none placeholder:text-ink-4 focus:border-brand-orange" />

                <label className="mt-3 block text-[13px] font-bold text-ink" htmlFor="rv-body">Written review</label>
                <textarea id="rv-body" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} maxLength={2000} rows={4}
                  placeholder="What did you like or dislike? What did you use this product for?"
                  className="mt-1 w-full rounded-[6px] border border-line-2 p-2 text-[14px] text-ink outline-none placeholder:text-ink-4 focus:border-brand-orange" />

                {error ? <p className="mt-2 text-[13px] text-error">{error}</p> : null}
                <div className="mt-3 flex items-center gap-2">
                  <button type="button" onClick={submitReview} className="h-[33px] rounded-pill bg-cta-yellow px-5 text-[13px] text-ink shadow-input hover:bg-cta-yellow-hover">Submit</button>
                  <button type="button" onClick={() => { setShowForm(false); setError(''); }} className="h-[33px] rounded-pill border border-line-3 bg-white px-5 text-[13px] text-ink hover:bg-surface-2">Cancel</button>
                </div>
                <p className="mt-2 text-[11px] text-ink-3">Saved in this browser for the demo.</p>
              </div>
            ) : null}
          </div>
        </aside>

        {/* Written reviews */}
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold text-ink">Top reviews from {country}</h3>
          <ul className="mt-4 divide-y divide-line-soft">
            {allReviews.map((r) => {
              const isMine = r.id.startsWith('user-');
              const marked = !!helpful[r.id];
              const helpfulCount = r.helpful + (marked ? 1 : 0);
              const isReported = !!reported[r.id];
              return (
                <li key={r.id} className="py-5 first:pt-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[13px] font-bold text-ink-2">{r.initial}</span>
                    <span className="text-[13px] text-ink">{r.author}</span>
                    {isMine ? <span className="rounded-[3px] bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold text-ink-2">Your review</span> : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Stars rating={r.rating} size={16} />
                    <span className="text-[14px] font-bold text-ink">{r.title}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-2">Reviewed in {country} on {r.date}</p>
                  {r.verified ? <p className="mt-1 text-[13px] font-bold text-warn">Verified Purchase</p> : null}
                  <p className="mt-2 text-[14px] leading-5 text-ink">{r.body}</p>
                  {helpfulCount > 0 ? (
                    <p className="mt-2 text-[13px] text-ink-2">
                      {helpfulCount.toLocaleString('en-US')} {helpfulCount === 1 ? 'person' : 'people'} found this helpful
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      aria-pressed={marked}
                      onClick={() => toggleHelpful(r.id)}
                      className={`flex h-[29px] items-center rounded-pill border px-5 text-[13px] shadow-input transition-colors ${marked ? 'border-link-teal bg-surface-3 font-semibold text-ink' : 'border-line-3 bg-white text-ink hover:bg-surface-2'}`}
                    >
                      {marked ? 'Helpful ✓' : 'Helpful'}
                    </button>
                    <span className="text-[12px] text-ink-4">|</span>
                    {isReported ? (
                      <span className="text-[13px] text-ink-3">Reported. Thanks for letting us know.</span>
                    ) : (
                      <button type="button" onClick={() => report(r.id)} className="text-[13px] text-ink-2 hover:text-link-hover hover:underline">Report</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

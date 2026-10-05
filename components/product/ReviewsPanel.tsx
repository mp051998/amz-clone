'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RatingSummary, Review } from '@/lib/types';
import { loadMoreReviews, removeReview, reportReview, submitReview, toggleReviewHelpful } from '@/app/actions/review';
import { Kicker, SourceTag } from '../decision/Badges';
import { Pill } from '../decision/Pill';
import { useToast } from '../decision/Toast';
import { Button, buttonClasses } from '../primitives/Button';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';
import { applyFilters, buildFilters, chipCount, reviewThemes } from './reviewFilters';

export interface ThemeCount { theme: string; count: number }

export interface ReviewsPanelProps {
  productId: string;
  summary: RatingSummary;
  initial: Review[];
  total: number;
  mine: Review | null;
  signedIn: boolean;
  defaultName: string;
  signinHref: string;
  /** store locale for numbers and dates ("en-US" / "en-IN") */
  locale: string;
  timeZone: string;
  insight: {
    summary: string;
    praised: ThemeCount[];
    criticized: ThemeCount[];
    source: 'ai' | 'rules';
  } | null;
  /** an AI summary is being generated in the background (provider on, stored summary is rules) */
  aiPending?: boolean;
}

/** Clickable 1–5 star picker for the write-review form. */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Your rating">
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
          className="flex h-11 w-10 items-center justify-center text-[26px] leading-none"
        >
          <span aria-hidden className={n <= shown ? 'text-star' : 'text-line-3'}>★</span>
        </button>
      ))}
    </div>
  );
}

const starLine = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/**
 * "What buyers actually think" + "Explore reviews" (prototype Product detail). Rating summary with
 * an ink histogram, praised/criticized themes with counts, the review summary (AI or rules, labelled),
 * then filter chips over the loaded reviews and review cards. Every write (review, helpful, report,
 * delete) goes through the server actions in app/actions/review.ts.
 */
export function ReviewsPanel({ productId, summary, initial, total, mine, signedIn, defaultName, signinHref, locale, timeZone, insight, aiPending }: ReviewsPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [active, setActive] = useState<string[]>([]);
  const [notice, setNotice] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ rating: mine?.rating ?? 0, title: mine?.title ?? '', body: mine?.body ?? '', name: mine?.author ?? defaultName });
  const [error, setError] = useState('');

  // fresh server data after router.refresh() replaces the local list
  useEffect(() => setItems(initial), [initial]);

  // "Write a product review" on a delivered order links to #write-review: open the form there
  useEffect(() => {
    if (!signedIn) return;
    const fromHash = () => {
      if (window.location.hash === '#write-review') setShowForm(true);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [signedIn]);
  useEffect(() => {
    if (showForm && window.location.hash === '#write-review') scrollToId('write-review');
  }, [showForm]);

  const num = (n: number) => n.toLocaleString(locale);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone }), [locale, timeZone]);
  const ratingText = summary.rating ? summary.rating.toFixed(1) : '—';
  const recommend = summary.bars.filter((b) => b.star >= 4).reduce((s, b) => s + b.count, 0);
  const recommendPct = summary.count ? Math.round((recommend / summary.count) * 100) : 0;

  const themes = useMemo(() => [...new Set([...(insight?.praised ?? []), ...(insight?.criticized ?? [])].map((t) => t.theme))], [insight]);
  const filters = useMemo(() => buildFilters(items, themes), [items, themes]);
  const shown = useMemo(() => applyFilters(items, filters, active), [items, filters, active]);

  const toggle = (id: string) => setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const focusFilter = (id: string) => { setActive([id]); scrollToId('reviews'); };

  const patch = (id: string, change: Partial<Review>) => setItems((list) => list.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const onSubmit = () => {
    if (!form.rating) return setError('Please select a star rating.');
    if (!form.title.trim() || !form.body.trim()) return setError('Please add a headline and a review.');
    startTransition(async () => {
      const res = await submitReview(productId, { rating: form.rating, title: form.title, body: form.body, authorName: form.name });
      if (!res.ok) return setError(res.message);
      setError('');
      setShowForm(false);
      toast(mine ? 'Your review was updated' : 'Thanks — your review is live');
      router.refresh();
    });
  };

  const onDelete = (id: string) =>
    startTransition(async () => {
      const res = await removeReview(productId, id);
      if (!res.ok) return setNotice((n) => ({ ...n, [id]: res.message }));
      setForm({ rating: 0, title: '', body: '', name: defaultName });
      toast('Your review was deleted');
      router.refresh();
    });

  const onHelpful = (r: Review) =>
    startTransition(async () => {
      const res = await toggleReviewHelpful(r.id);
      if (!res.ok) return setNotice((n) => ({ ...n, [r.id]: res.message }));
      patch(r.id, { votedHelpful: res.helpful, helpful: res.helpfulCount });
    });

  const onReport = (r: Review) =>
    startTransition(async () => {
      const res = await reportReview(r.id);
      if (!res.ok) return setNotice((n) => ({ ...n, [r.id]: res.message }));
      patch(r.id, { reported: true });
      toast('Reported. Thanks for letting us know.');
    });

  const onMore = () =>
    startTransition(async () => {
      const res = await loadMoreReviews(productId, items.length);
      if (res.ok) setItems((list) => [...list, ...res.items.filter((r) => !list.some((x) => x.id === r.id))]);
    });

  const activeLabels = filters.filter((f) => active.includes(f.id)).map((f) => f.label);
  const countText = active.length
    ? `${shown.length} of ${num(items.length)} loaded reviews · ${activeLabels.join(' + ')}`
    : items.length
      ? `Showing ${num(items.length)} of ${num(total)} written reviews, most helpful first`
      : 'No written reviews yet';

  const summaryKicker = insight?.source === 'ai'
    ? `AI summary · from ${num(summary.count)} reviews`
    : `Review summary · from ${num(summary.count)} ratings`;

  return (
    <>
      <section id="insight" aria-labelledby="insight-h" className="flex scroll-mt-[140px] flex-col gap-[18px]" aria-busy={pending}>
        <h2 id="insight-h" className="m-0 text-[22px] font-semibold sm:text-[24px]">What buyers actually think</h2>
        <div className="flex flex-wrap items-stretch gap-3.5">
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5 rounded-card border border-line bg-surface p-[18px]">
            <div className="flex items-baseline gap-2">
              <strong className="text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{ratingText}</strong>
              <span aria-hidden className="text-[20px] text-star">★</span>
              <span className="sr-only">out of 5 stars</span>
            </div>
            <span className="text-[14px] text-ink-2">{num(summary.count)} ratings</span>
            {summary.count ? <strong className="text-[16px] font-semibold">{recommendPct}% rate it 4★ or higher</strong> : null}
            <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0" aria-label="Rating distribution">
              {summary.bars.map((b) => (
                <li key={b.star} className="flex items-center gap-2 text-[13px]">
                  <span className="w-[22px] tabular-nums">{b.star}★</span>
                  <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-tag bg-surface-4">
                    <span className="block h-full bg-ink" style={{ width: `${b.pct}%` }} />
                  </span>
                  <span className="w-[38px] text-right text-ink-2 tabular-nums">{b.pct}%</span>
                  <span className="sr-only">{`${b.star} stars: ${b.pct}%`}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-3.5 rounded-card border border-line bg-surface p-[18px]">
            <ThemeList title="Most praised" tone="good" items={insight?.praised ?? []} num={num} empty="Not enough reviews to call out strengths yet." />
            <ThemeList title="Most criticized" tone="bad" items={insight?.criticized ?? []} num={num} empty="No recurring complaints so far." />
          </div>

          <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-3 rounded-card border border-line bg-surface p-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Kicker>{summaryKicker}</Kicker>
              <SourceTag source={insight?.source ?? 'rules'} rulesLabel="Rules · ratings & themes" detail={insight?.source === 'ai' ? 'generated' : undefined} />
            </div>
            <p className="m-0 text-[17px] leading-normal text-pretty sm:text-[18px]">
              {insight?.summary || 'There isn’t enough review data to summarise this product yet.'}
            </p>
            {aiPending ? <p className="m-0 text-[13px] text-ink-3">An AI summary of the written reviews is being prepared — refresh in a moment.</p> : null}
            <div className="mt-auto flex flex-wrap gap-2">
              <Button variant="dark" onClick={() => focusFilter('positive')}>Read supporting reviews →</Button>
              <Button variant="secondary" onClick={() => focusFilter('critical')}>Show critical reviews</Button>
            </div>
          </div>
        </div>
      </section>

      <section id="reviews" aria-labelledby="reviews-h" className="flex scroll-mt-[140px] flex-col gap-4" aria-busy={pending}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="reviews-h" className="m-0 text-[22px] font-semibold">Explore reviews</h2>
          <span className="text-[14px] text-ink-2" aria-live="polite">{countText}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {items.length ? (
            <>
              <Pill selected={!active.length} onClick={() => setActive([])}>
                All <span className="font-mono text-[12px] opacity-75">{items.length}</span>
              </Pill>
              {filters.map((f) => (
                <Pill key={f.id} selected={active.includes(f.id)} onClick={() => toggle(f.id)}>
                  {f.label} <span className="font-mono text-[12px] opacity-75">{chipCount(items, filters, active, f.id)}</span>
                </Pill>
              ))}
            </>
          ) : null}
          <span className="ml-auto">
            {signedIn ? (
              <Button variant="secondary" size="sm" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm} aria-controls="write-review">
                {mine ? 'Edit your review' : 'Write a review'}
              </Button>
            ) : (
              <a href={signinHref} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Sign in to write a review</a>
            )}
          </span>
        </div>

        {showForm ? (
          <div id="write-review" className="flex max-w-[640px] scroll-mt-[140px] flex-col gap-3 rounded-card border border-line bg-surface p-[18px]">
            <Kicker>{mine ? 'Update your review' : 'Review this product'}</Kicker>
            <div>
              <span className="block text-[14px] font-semibold">Overall rating</span>
              <StarPicker value={form.rating} onChange={(n) => setForm((f) => ({ ...f, rating: n }))} />
            </div>
            <label className="flex flex-col gap-1.5 text-[14px] font-semibold" htmlFor="rv-name">
              Public name
              <input id="rv-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={60} className={cn(fieldClass, 'font-normal')} />
            </label>
            <label className="flex flex-col gap-1.5 text-[14px] font-semibold" htmlFor="rv-title">
              Headline
              <input id="rv-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={120}
                placeholder="What's most important to know?" className={cn(fieldClass, 'font-normal')} />
            </label>
            <label className="flex flex-col gap-1.5 text-[14px] font-semibold" htmlFor="rv-body">
              Your review
              <textarea id="rv-body" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} maxLength={4000} rows={5}
                placeholder="What did you like or dislike? What did you use it for, and for how long?"
                className={cn(fieldClass, 'h-auto py-2.5 font-normal leading-normal')} />
            </label>
            {error ? <p role="alert" className="m-0 text-[13px] text-bad">⚠ {error}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" loading={pending} onClick={onSubmit}>{mine ? 'Update review' : 'Submit review'}</Button>
              <Button variant="secondary" onClick={() => { setShowForm(false); setError(''); }}>Cancel</Button>
            </div>
            <p className="m-0 text-[12px] text-ink-3">&ldquo;Verified purchase&rdquo; is added automatically when you have ordered this item.</p>
          </div>
        ) : null}

        {shown.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-3.5">
            {shown.map((r) => (
              <article key={r.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-[18px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span role="img" aria-label={`${r.rating} out of 5 stars`} className="tracking-[1px] text-star">{starLine(r.rating)}</span>
                  <span className="text-[12px] text-ink-3">{r.author}</span>
                </div>
                {(r.verified || r.mine || themes.length) ? (
                  <div className="flex flex-wrap gap-1.5">
                    {r.mine ? <span className="rounded-[5px] bg-ink px-[7px] py-[3px] text-[12px] font-semibold text-on-ink">Your review</span> : null}
                    {r.hidden ? <span className="rounded-[5px] border border-line px-[7px] py-[3px] text-[12px] font-semibold text-bad">Hidden from shoppers</span> : null}
                    {r.verified ? <span className="rounded-[5px] bg-surface-2 px-[7px] py-[3px] text-[12px] font-semibold">Verified purchase</span> : null}
                    {reviewThemes(r, themes).map((t) => (
                      <span key={t} className="rounded-[5px] bg-surface-2 px-[7px] py-[3px] text-[12px] font-semibold">{t}</span>
                    ))}
                  </div>
                ) : null}
                <strong className="text-[17px] font-semibold leading-[1.3]">{r.title}</strong>
                <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55] text-ink-2 text-pretty">{r.body}</p>
                {r.hidden ? (
                  <p className="m-0 text-[12px] text-ink-3">Only you can see this review. It was hidden after reports from other shoppers, or by our team, and doesn’t count toward the rating.</p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line-2 pt-2">
                  <div className="flex items-center gap-2">
                    {r.mine ? (
                      <button type="button" disabled={pending} onClick={() => onDelete(r.id)} className="min-h-9 rounded-pill border border-line px-3 text-[13px] hover:border-ink">Delete</button>
                    ) : signedIn ? (
                      <>
                        <button
                          type="button"
                          aria-pressed={r.votedHelpful}
                          disabled={pending}
                          onClick={() => onHelpful(r)}
                          className={cn('min-h-9 rounded-pill border px-3 text-[13px] tabular-nums transition-colors', r.votedHelpful ? 'border-ink bg-ink text-on-ink' : 'border-line hover:border-ink')}
                        >
                          {r.votedHelpful ? '✓ Helpful' : 'Helpful'} · {num(r.helpful)}
                        </button>
                        {r.reported ? (
                          <span className="text-[12px] text-ink-3">Reported</span>
                        ) : (
                          <button type="button" disabled={pending} onClick={() => onReport(r)} className="min-h-9 px-1 text-[13px] text-ink-3 underline underline-offset-2 hover:text-ink">Report</button>
                        )}
                      </>
                    ) : (
                      <a href={signinHref} className="inline-flex min-h-9 items-center rounded-pill border border-line px-3 text-[13px] text-ink no-underline hover:border-ink">Helpful · {num(r.helpful)}</a>
                    )}
                  </div>
                  <span className="text-[12px] text-ink-3">{monthFmt.format(new Date(r.createdAt))}</span>
                </div>
                {notice[r.id] ? <p role="status" className="m-0 text-[12px] text-bad">{notice[r.id]}</p> : null}
              </article>
            ))}
          </div>
        ) : items.length ? (
          <div className="rounded-card border border-dashed border-line-3 bg-surface p-[22px] text-[15px]">
            No reviews match every filter.{' '}
            <button type="button" onClick={() => setActive([])} className="text-[15px] underline underline-offset-2">Clear filters</button>
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-line-3 bg-surface p-[22px] text-[15px] text-ink-2">
            No written reviews yet{summary.count ? ` — the ${num(summary.count)} ratings above are star-only` : ''}. Be the first to share how it holds up.
          </div>
        )}

        {items.length < total ? (
          <Button variant="secondary" className="self-start" loading={pending} onClick={onMore}>
            Load more reviews ({num(total - items.length)} more)
          </Button>
        ) : null}
      </section>
    </>
  );
}

function ThemeList({ title, tone, items, num, empty }: { title: string; tone: 'good' | 'bad'; items: ThemeCount[]; num: (n: number) => string; empty: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[15px] font-semibold">{title}</span>
      {items.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((t) => (
            <li key={t.theme} className="flex items-center gap-2.5 text-[15px]">
              <span aria-hidden className={cn('h-[9px] w-[9px] flex-none rounded-full', tone === 'good' ? 'bg-good-dot' : 'bg-bad-dot')} />
              {t.theme}
              <span className="ml-auto font-mono text-[12px] text-ink-3 tabular-nums">{num(t.count)} mentions</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[14px] text-ink-3">{empty}</span>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { EmptyState, ProductFrame } from '@/components/decision';
import { ReviewPhotoThumbs } from '@/components/product/ReviewPhotos';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { Stars } from '@/components/primitives/Stars';
import { readUser } from '@/lib/auth';
import { messageFor } from '@/lib/data/errors';
import { awaitingReview, listMyReviews } from '@/lib/data/reviews';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { deleteMyReview } from './actions';

export const metadata: Metadata = { title: 'Your reviews · Store' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * /account/reviews: what's waiting for a review (delivered, not reviewed yet) and every review the
 * shopper has written in this store, with their photos, Edit (on the product page) and Delete.
 */
export default async function YourReviewsPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/account/reviews'));
  const client = await db();
  const [waiting, written, { done, error }] = await Promise.all([
    awaitingReview(client, store.id, user.id).catch(() => []),
    listMyReviews(client, store.id, user.id),
    searchParams,
  ]);
  const day = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone });
  const reviewHref = (productId: string) => sp(`/product/${encodeURIComponent(productId)}#write-review`);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <a href={sp('/account')} className="self-start text-[14px] text-ink underline underline-offset-2">← Account</a>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Your reviews</h1>
          <span className="text-[15px] text-ink-2">Things you’ve received that are waiting for a review, and the reviews you’ve written.</span>
          {written.some(({ review }) => !review.hidden) ? (
            <a href={sp(`/profile/${encodeURIComponent(user.id)}`)} className="self-start text-[14px] text-ink underline underline-offset-2">See your public profile</a>
          ) : null}
        </div>

        {done === 'deleted' ? <Alert tone="success">Review deleted.</Alert> : null}
        {error ? <Alert tone="error">{messageFor(error) ?? 'Couldn’t delete that review. Try again.'}</Alert> : null}

        {!waiting.length && !written.length ? (
          <EmptyState title="Nothing to review yet" action={<a href={sp('/orders')} className={buttonClasses({ variant: 'secondary' })}>Your orders</a>}>
            Once an order arrives, the things in it show up here for you to review.
          </EmptyState>
        ) : null}

        {waiting.length ? (
          <section aria-labelledby="waiting-h" className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="waiting-h" className="m-0 text-[20px] font-semibold">Waiting for your review</h2>
              <span className="text-[14px] text-ink-3">{plural(waiting.length, 'item')}</span>
            </div>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5 p-0">
              {waiting.map(({ product: p, deliveredAt }) => (
                <li key={p.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5">
                  <a href={sp(`/product/${encodeURIComponent(p.id)}`)} tabIndex={-1} aria-hidden>
                    <ProductFrame src={p.image} alt="" aspect="1/1" />
                  </a>
                  <a href={sp(`/product/${encodeURIComponent(p.id)}`)} className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink no-underline hover:underline">{p.title}</a>
                  <span className="text-[13px] text-ink-3">Delivered {day.format(new Date(deliveredAt))}</span>
                  <a href={reviewHref(p.id)} className={buttonClasses({ variant: 'secondary', size: 'sm' })} aria-label={`Write a review: ${p.title}`}>
                    Write a review
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {written.length ? (
          <section aria-labelledby="written-h" className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="written-h" className="m-0 text-[20px] font-semibold">Reviews you’ve written</h2>
              <span className="text-[14px] text-ink-3">{plural(written.length, 'review')}</span>
            </div>
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
              {written.map(({ review: r, product: p }) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3.5 border-t border-line-2 px-4 py-4 first:border-t-0">
                  <a href={sp(`/product/${encodeURIComponent(p.id)}`)} className="w-[72px] flex-none" tabIndex={-1} aria-hidden>
                    <ProductFrame src={p.image} alt="" aspect="1/1" />
                  </a>
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                    <a href={sp(`/product/${encodeURIComponent(p.id)}`)} className="line-clamp-2 text-[14px] text-ink-2 no-underline hover:underline">{p.title}</a>
                    <span className="flex flex-wrap items-center gap-2">
                      <Stars rating={r.rating} size={14} />
                      <strong className="text-[15px] font-semibold">{r.title}</strong>
                    </span>
                    <p className="m-0 line-clamp-3 text-[14px] leading-[1.5]">{r.body}</p>
                    <ReviewPhotoThumbs photos={r.photos} author={`your review of ${p.title}`} />
                    <span className="text-[13px] text-ink-3">
                      Reviewed {day.format(new Date(r.createdAt))}
                      {r.verified ? ' · Verified purchase' : ''}
                      {r.helpful ? ` · ${r.helpful === 1 ? '1 person' : `${r.helpful.toLocaleString('en-US')} people`} found this helpful` : ''}
                    </span>
                    {r.hidden ? (
                      <span className="text-[13px] font-semibold text-bad">Hidden from shoppers after reports. Only you can see it.</span>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <a href={reviewHref(p.id)} className="text-[14px] text-ink underline underline-offset-2" aria-label={`Edit your review of ${p.title}`}>Edit</a>
                      <ConfirmAction
                        action={deleteMyReview.bind(null, r.id)}
                        label="Delete"
                        prompt={<>Delete your review of <b>{p.title}</b>?</>}
                        confirmLabel="Delete review"
                        pendingLabel="Deleting…"
                        size="link"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

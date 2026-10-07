import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Pagination } from '@/components/commerce/Pagination';
import { ProductFrame } from '@/components/decision';
import { ReviewPhotoThumbs } from '@/components/product/ReviewPhotos';
import { Stars } from '@/components/primitives/Stars';
import { reviewerProfile } from '@/lib/data/reviews';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

type Params = Promise<{ id: string }>;
type Search = Promise<{ page?: string | string[] }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const store = await getMarketplace();
  const profile = await reviewerProfile(await db(), store.id, (await params).id).catch(() => null);
  return { title: `${profile?.name ?? 'Customer'}’s profile · Store`, robots: { index: false } };
}

/**
 * /profile/:id — a reviewer's public profile, linked from their name on a review: the reviews
 * they've written in this store that shoppers can see, and the helpful votes those have had.
 */
export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const store = await getMarketplace();
  const path = (p: string) => storePath(store, p);
  const profile = await reviewerProfile(await db(), store.id, id, Number(one(sp.page)) || 1);
  if (!profile) notFound();
  const num = (n: number) => n.toLocaleString(store.locale.default);
  const day = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone });
  const here = `/profile/${encodeURIComponent(id)}`;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <header className="flex flex-wrap items-center gap-4">
          <span aria-hidden className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-ink text-[28px] font-semibold text-on-ink">{profile.initial}</span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">{profile.name}</h1>
            <dl className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-2">
              <div className="flex gap-1.5">
                <dt>Reviews</dt>
                <dd className="m-0 font-semibold text-ink tabular-nums">{num(profile.total)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Helpful votes</dt>
                <dd className="m-0 font-semibold text-ink tabular-nums">{num(profile.helpful)}</dd>
              </div>
            </dl>
          </div>
        </header>

        <section aria-labelledby="profile-reviews-h" className="flex flex-col gap-3.5">
          <h2 id="profile-reviews-h" className="m-0 text-[20px] font-semibold">Reviews</h2>
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
            {profile.reviews.map(({ review: r, product: p }) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3.5 border-t border-line-2 px-4 py-4 first:border-t-0">
                <a href={path(`/product/${encodeURIComponent(p.id)}`)} className="w-[72px] flex-none" tabIndex={-1} aria-hidden>
                  <ProductFrame src={p.image} alt="" aspect="1/1" />
                </a>
                <article aria-label={r.title} className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                  <a href={path(`/product/${encodeURIComponent(p.id)}#reviews`)} className="line-clamp-2 text-[14px] text-ink-2 no-underline hover:underline">{p.title}</a>
                  <span className="flex flex-wrap items-center gap-2">
                    <Stars rating={r.rating} size={14} />
                    <strong className="text-[15px] font-semibold">{r.title}</strong>
                  </span>
                  <p className="m-0 whitespace-pre-line text-[14px] leading-[1.5]">{r.body}</p>
                  <ReviewPhotoThumbs photos={r.photos} author={profile.name} />
                  <span className="text-[13px] text-ink-3">
                    Reviewed {day.format(new Date(r.createdAt))}
                    {r.verified ? ' · Verified purchase' : ''}
                    {r.helpful ? ` · ${r.helpful === 1 ? '1 person' : `${num(r.helpful)} people`} found this helpful` : ''}
                  </span>
                </article>
              </li>
            ))}
          </ul>
          {profile.pageCount > 1 ? (
            <Pagination page={profile.page} pageCount={profile.pageCount} hrefFor={(n) => path(n === 1 ? here : `${here}?page=${n}`)} />
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

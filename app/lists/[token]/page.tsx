import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState, ProductFrame } from '@/components/decision';
import { AddFromList } from '@/components/collections/AddFromList';
import { SeeOptions } from '@/components/product/SeeOptions';
import { GiftMark } from '@/components/collections/GiftMark';
import { ItemNotes } from '@/components/collections/ItemNotes';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { Stars } from '@/components/primitives/Stars';
import { readUser } from '@/lib/auth';
import { getSharedList } from '@/lib/data/collections';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';

type Params = Promise<{ token: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const list = await getSharedList(await db(), (await params).token);
  // a private link: never indexed
  return { title: list ? `${list.name} · Shared list · Store` : 'List not found · Store', robots: { index: false, follow: false } };
}

/**
 * /lists/<token> (and /in/lists/<token>): a collection someone shared by link. Anyone with the
 * link sees its name, the sharer's first name and its products, and can add them to their cart.
 * Gift givers mark what they've bought so nobody buys it twice; the sharer never sees the marks.
 */
export default async function SharedListPage({ params }: { params: Params }) {
  const { token } = await params;
  const store = await getMarketplace();
  const [list, user] = await Promise.all([getSharedList(await db(), token), readUser()]);
  if (!list) notFound();
  if (list.market !== store.id) redirect(storePath({ id: list.market }, `/lists/${token}`));

  const sp = (path: string) => storePath(store, path);
  const n = list.products.length;
  const boughtCount = list.products.filter((p) => list.bought[p.id]).length;
  const signInHref = user ? undefined : sp(`/signin?next=${encodeURIComponent(`/lists/${token}`)}`);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[160px] pt-7">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-3">Shared list</span>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em] text-pretty">{list.name}</h1>
          <span className="text-[15px] text-ink-2">
            Shared by {list.ownerName} · {n} {n === 1 ? 'item' : 'items'}
            {boughtCount ? ` · ${boughtCount} bought` : ''}
          </span>
          {!list.mine && n ? (
            <span className="text-[14px] text-ink-3">Bought something here or somewhere else? Mark it so no one buys it twice. {list.ownerName} won’t see what’s marked.</span>
          ) : null}
        </div>

        {list.mine ? (
          <Alert tone="info">
            This is your list. Only people with the link can see it.{' '}
            <a href={sp(`/collections${list.collectionId ? `?c=${list.collectionId}` : ''}`)} className="text-ink underline underline-offset-2">Manage it in Collections</a>
          </Alert>
        ) : null}

        {n === 0 ? (
          <EmptyState action={<a href={sp('/deals')} className={buttonClasses({ variant: 'secondary' })}>Browse today’s deals</a>}>
            Nothing on this list yet.
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 p-0">
            {list.products.map((p) => {
              const href = sp(`/product/${encodeURIComponent(p.id)}`);
              const cut = p.listMinor && p.listMinor > p.priceMinor ? p.listMinor : null;
              return (
                <li key={p.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5">
                  <a href={href} tabIndex={-1} aria-hidden>
                    <ProductFrame src={p.image} alt="" aspect="1/1" />
                  </a>
                  <a href={href} className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink no-underline hover:underline">{p.title}</a>
                  {p.reviewCount ? <Stars rating={p.rating} count={p.reviewCount} size={14} /> : null}
                  <span className="flex flex-wrap items-baseline gap-2">
                    <strong className="text-[18px] tabular-nums">{formatMoney(p.priceMinor, p.curBase)}</strong>
                    {cut ? <s className="text-[13px] text-ink-3 tabular-nums">{formatMoney(cut, p.curBase)}</s> : null}
                  </span>
                  <ItemNotes {...list.details[p.id]} />
                  <div className="mt-auto flex flex-col gap-2">
                    {p.sizes && p.stock > 0 ? (
                      <SeeOptions href={href} name={p.title} variant="primary" size="md" />
                    ) : (
                      <AddFromList productId={p.id} productName={p.title} inStock={p.stock > 0} />
                    )}
                    {list.mine ? null : <GiftMark token={token} productId={p.id} productName={p.title} mark={list.bought[p.id]} signInHref={signInHref} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EmptyState, ProductFrame } from '@/components/decision';
import { buttonClasses } from '@/components/primitives/Button';
import { CollectionMenu, CollectionNote, ItemActions, NewCollection } from '@/components/collections/CollectionControls';
import { ShareList } from '@/components/collections/ShareList';
import { cn } from '@/components/lib/cn';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listCollections } from '@/lib/data/collections';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { siteOrigin } from '@/lib/origin';
import type { Collection, CollectionItem } from '@/lib/decision/types';

export const metadata: Metadata = { title: 'Collections · Store' };

const COMPARE_MAX = 4;

/** saved − current, minor units (positive = cheaper now). */
const dropOf = (i: CollectionItem) => i.savedPriceMinor - i.product.priceMinor;

function dropTotal(c: Collection): number {
  return c.items.reduce((sum, i) => sum + Math.max(0, dropOf(i)), 0);
}

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  if (!(await readUser())) redirect(sp(`/signin?next=${encodeURIComponent(c ? `/collections?c=${c}` : '/collections')}`));

  const cur = store.currency.code;
  const money = (minor: number) => formatMoney(minor, cur);
  const collections = await listCollections(await db(), store.id);
  const selected = collections.find((x) => x.id === c) ?? collections[0] ?? null;
  // archived products stay in the list but are out of the catalog, so compare skips them
  const comparable = selected ? selected.items.filter((i) => !i.product.archived) : [];
  const compareIds = comparable.slice(0, COMPARE_MAX).map((i) => encodeURIComponent(i.product.id));
  const moveTargets = selected ? collections.filter((x) => x.id !== selected.id).map((x) => ({ id: x.id, name: x.name })) : [];
  const shareUrl = selected?.shareToken ? `${await siteOrigin()}${sp(`/lists/${selected.shareToken}`)}` : null;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[160px] pt-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Collections</h1>
          <span className="text-[15px] text-ink-2">Everything you&apos;ve saved, grouped, with prices tracked.</span>
        </div>

        <div className="flex flex-wrap items-start gap-[22px]">
          <aside className="flex flex-[1_1_240px] flex-col gap-2" aria-label="Your collections">
            <nav className="flex flex-col gap-2">
              {collections.map((col) => {
                const on = selected?.id === col.id;
                const drop = dropTotal(col);
                const n = col.items.length;
                return (
                  <a
                    key={col.id}
                    href={sp(`/collections?c=${col.id}`)}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'flex min-h-14 items-center justify-between gap-2.5 rounded-card border px-4 py-3.5 no-underline transition-colors',
                      on ? 'border-ink bg-ink text-on-ink hover:text-on-ink' : 'border-line bg-surface text-ink hover:border-ink hover:text-ink',
                    )}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[16px] font-semibold">{col.name}</span>
                      <span className={cn('text-[13px]', on ? 'text-on-ink/80' : 'text-ink-3')}>{n} {n === 1 ? 'item' : 'items'}</span>
                    </span>
                    {drop > 0 ? (
                      <span className={cn('flex-none font-mono text-[12px]', on ? 'text-on-ink' : 'text-good-strong')} aria-label={`Prices down ${money(drop)} since saved`}>
                        ↓ {money(drop)}
                      </span>
                    ) : null}
                  </a>
                );
              })}
            </nav>
            <NewCollection market={store.id} />
          </aside>

          <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5" aria-labelledby="collection-h">
            {!selected ? (
              <>
                <h2 id="collection-h" className="m-0 text-[22px] font-semibold">Nothing saved yet</h2>
                <EmptyState action={<a href={sp('/s')} className={buttonClasses({ variant: 'dark' })}>Start searching</a>}>
                  Tap ♡ Save on any product and it lands in Things I&apos;m Considering, with its price tracked from that moment.
                </EmptyState>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="collection-h" className="m-0 text-[22px] font-semibold">{selected.name}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {selected.kind === 'custom' ? <CollectionMenu id={selected.id} name={selected.name} market={store.id} /> : null}
                    {comparable.length >= 2 ? (
                      <a href={sp(`/compare?ids=${compareIds.join(',')}`)} className={buttonClasses({ variant: 'dark' })}>
                        Compare these{comparable.length > COMPARE_MAX ? ` (first ${COMPARE_MAX})` : ''}
                      </a>
                    ) : null}
                  </div>
                </div>
                <ShareList key={selected.id} id={selected.id} name={selected.name} market={store.id} url={shareUrl} />

                {selected.items.length === 0 ? (
                  <EmptyState action={<a href={sp('/s')} className={buttonClasses({ variant: 'secondary' })}>Find something to save</a>}>
                    {selected.kind === 'custom'
                      ? 'Nothing here yet. Use Add to List on any product page to put things here.'
                      : 'Nothing here yet. Tap ♡ Save on any product.'}
                  </EmptyState>
                ) : (
                  <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
                    {selected.items.map((it) => {
                      const p = it.product;
                      const d = dropOf(it);
                      const href = sp(`/product/${p.id}`);
                      return (
                        <li key={p.id} className="flex flex-wrap items-center gap-3.5 border-t border-line-2 px-4 py-3.5 first:border-t-0">
                          <a href={href} className={cn('w-[72px] flex-none', p.archived && 'opacity-50')} tabIndex={-1} aria-hidden>
                            <ProductFrame src={p.image} alt="" aspect="1/1" />
                          </a>
                          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-[3px]">
                            <a href={href} className="line-clamp-2 text-[16px] font-semibold text-ink no-underline">{p.title}</a>
                            {p.archived ? (
                              <span className="text-[14px] font-semibold text-warn">No longer available</span>
                            ) : (
                              <>
                                <strong className="text-[17px] tabular-nums">{formatMoney(p.priceMinor, p.curBase)}</strong>
                                <span
                                  className={cn('text-[14px] font-semibold', d > 0 ? 'text-good-strong' : d < 0 ? 'text-warn' : 'font-normal text-ink-3')}
                                >
                                  {d > 0
                                    ? `↓ ${formatMoney(d, p.curBase)} since you saved`
                                    : d < 0
                                      ? `↑ ${formatMoney(-d, p.curBase)} since you saved`
                                      : 'Same price as when saved'}
                                </span>
                              </>
                            )}
                          </div>
                          <ItemActions
                            collectionId={selected.id}
                            collectionName={selected.name}
                            productId={p.id}
                            productName={p.title}
                            inStock={p.stock > 0}
                            unavailable={p.archived}
                            market={store.id}
                            moveTo={moveTargets}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}

                <CollectionNote id={selected.id} note={selected.note} market={store.id} />
              </>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

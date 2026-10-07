import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { CouponCard } from '@/components/coupons/CouponCard';
import { PromoCodes } from '@/components/coupons/PromoCodes';
import { Page, PageHead, Section, cardGrid } from '@/components/brand/Page';
import { Pill } from '@/components/decision/Pill';
import { EmptyState } from '@/components/decision/Badges';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { listCouponOffers } from '@/lib/data/coupons';
import { activePromoCodes } from '@/lib/data/promo';
import { storeCategories } from '@/lib/storefront';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: 'Coupons · Store' };

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ c?: string; applied?: string }> }) {
  const sp = await searchParams;
  const c = sp.c;
  const store = await getMarketplace();
  const user = await readUser();
  const applied = Boolean(user) && sp.applied === '1';
  const client = await db();
  const [all, categories, promos] = await Promise.all([listCouponOffers(client, store.id, user != null), storeCategories(), activePromoCodes(client, store.id)]);
  const present = new Set(all.map((o) => o.product.category));
  const chips = categories.filter((cat) => present.has(cat.slug));
  const categoryName = (slug: string) => categories.find((x) => x.slug === slug)?.name ?? slug;
  const inCategory = c ? all.filter((o) => o.product.category === c) : all;
  const items = applied ? inCategory.filter((o) => o.clipped) : inCategory;
  const appliedCount = all.filter((o) => o.clipped).length;
  /** this view with the category and/or applied filter changed */
  const couponsHref = (next: { c?: string | null; applied?: boolean }) => {
    const qs = new URLSearchParams();
    const cat = next.c === undefined ? c : next.c;
    if (cat) qs.set('c', cat);
    if (next.applied ?? applied) qs.set('applied', '1');
    const q = qs.toString();
    return storePath(store, q ? `/coupons?${q}` : '/coupons');
  };

  return (
    <AppShell>
      <Page>
        <PageHead kicker={`Coupons · ${all.length} available`} title={c ? `Coupons in ${categoryName(c)}` : 'Coupons'}>
          Apply a coupon and its saving comes off every unit of that product in your cart and at checkout. Coupons stay applied until you remove them.
        </PageHead>

        <Section>
          <nav aria-label="Coupon categories" className="no-scrollbar -mx-[clamp(16px,3vw,24px)] flex gap-2 overflow-x-auto px-[clamp(16px,3vw,24px)] pb-1">
            <Pill href={couponsHref({ c: null })} selected={!c}>All coupons</Pill>
            {chips.map((cat) => (
              <Pill key={cat.slug} href={couponsHref({ c: cat.slug })} selected={c === cat.slug}>{cat.name}</Pill>
            ))}
          </nav>
          {user && appliedCount ? (
            <div role="group" aria-label="Applied" className="flex gap-2">
              <Pill size="sm" tone="soft" href={couponsHref({ applied: false })} selected={!applied}>Every coupon</Pill>
              <Pill size="sm" tone="soft" href={couponsHref({ applied: true })} selected={applied}>
                Applied <span className="font-mono text-[12px] opacity-75">{appliedCount}</span>
              </Pill>
            </div>
          ) : null}
          <p className="m-0 text-[14px] text-ink-3">
            {c ? <>{categoryName(c)} · </> : <>All categories · </>}
            {applied ? <>Applied · </> : null}
            <span className="tabular-nums">{items.length}</span> {items.length === 1 ? 'coupon' : 'coupons'}
            {!user && all.length ? <> · <a href={storePath(store, '/signin?next=/coupons')} className="text-ink underline underline-offset-2">Sign in</a> to apply them</> : null}
          </p>

          {items.length ? (
            <div className={cardGrid}>
              {items.map((o) => (<CouponCard key={o.product.id} offer={o} store={store} signedIn={user != null} />))}
            </div>
          ) : applied ? (
            <EmptyState
              title={`No applied coupons${c ? ` in ${categoryName(c)}` : ''}`}
              action={<a href={couponsHref({ applied: false })} className={buttonClasses({ variant: 'secondary' })}>See every coupon</a>}
            >
              Coupons you apply show up here.
            </EmptyState>
          ) : (
            <EmptyState
              title={c ? `No coupons in ${categoryName(c)} right now` : 'No coupons right now'}
              action={<a href={storePath(store, '/deals')} className={buttonClasses({ variant: 'secondary' })}>See today’s deals</a>}
            >
              Coupons change often. Check back soon.
            </EmptyState>
          )}
        </Section>

        {applied ? null : (
          <Section>
            <PromoCodes promos={promos} store={store} />
          </Section>
        )}
      </Page>
    </AppShell>
  );
}

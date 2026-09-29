import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { EmptyState, Kicker, MatchBadge, TopPickBadge } from '@/components/decision/Badges';
import { CheckList } from '@/components/decision/CheckList';
import { PriorityDots } from '@/components/decision/PriorityDots';
import { ProductFrame } from '@/components/decision/ProductFrame';
import { buttonClasses } from '@/components/primitives/Button';
import { compareVerdictAI } from '@/lib/ai/features/compare';
import { decisionConfig } from '@/lib/decision/attributes';
import { effectiveWeights, readDecisionParams } from '@/lib/decision/params';
import { rankProducts } from '@/lib/decision/rank';
import { compareTable, shortTitle } from '@/lib/decision/verdict';
import { getProducts } from '@/lib/data/catalog';
import { getInsights } from '@/lib/data/insights';
import { toStoreMinor } from '@/lib/fx';
import { formatMoney } from '@/lib/marketplaces';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { cn } from '@/components/lib/cn';
import { RemoveFromCompare } from './CompareClient';

export const metadata: Metadata = { title: 'Compare · Store' };

type SP = Record<string, string | string[] | undefined>;

const MAX = 4;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function one(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Compare 2–4 products (prototype Compare screen): /compare?ids=a,b,c (and /in/compare).
 * Unknown ids and products from the other store are ignored. Weights come from the URL
 * (`w` / `preset` / `use`, lib/decision/params.ts) or the category defaults.
 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await getMarketplace();
  const ids = [...new Set((one(sp, 'ids') ?? '').split(',').map((s) => s.trim()).filter((s) => ID.test(s)))].slice(0, MAX);
  const client = await db();
  const products = (await getProducts(client, ids)).filter((p) => p.market === store.id);

  // majority category drives the attributes (ties → first product's)
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const category = products.length ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
  const cfg = decisionConfig(category);
  const weights = effectiveWeights(readDecisionParams(sp, category, store.id), category);

  const searchParamsOut = new URLSearchParams();
  if (category) searchParamsOut.set('dept', category);
  for (const key of ['w', 'preset', 'use', 'budget']) {
    const v = one(sp, key);
    if (v) searchParamsOut.set(key, v);
  }
  const searchHref = storePath(store, `/s?${searchParamsOut.toString()}`);
  const hrefWithout = (id: string) => {
    const out = new URLSearchParams();
    for (const [key, v] of Object.entries(sp)) if (typeof v === 'string' && key !== 'ids') out.set(key, v);
    const rest = products.map((p) => p.id).filter((x) => x !== id);
    if (rest.length) out.set('ids', rest.join(','));
    const qs = out.toString().replace(/%2C/g, ',');
    return storePath(store, qs ? `/compare?${qs}` : '/compare');
  };

  const weightRows = cfg.attributes
    .map((a, i) => ({ a, i, w: weights[a.key] ?? 0 }))
    .filter((x) => x.w > 0)
    .sort((x, y) => y.w - x.w || x.i - y.i);

  const header = (
    <>
      <a href={searchHref} className="self-start text-[14px] text-ink underline underline-offset-2">← Back</a>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold">Compare products</h1>
          {products.length ? (
            <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-2">
              <span>Ranked using your priorities:</span>
              {weightRows.map(({ a, w }) => (
                <span key={a.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  {a.label} <PriorityDots value={w} label={a.label} size="sm" />
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <a href={searchHref} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Edit priorities</a>
      </div>
    </>
  );

  if (products.length < 2) {
    return (
      <AppShell>
        <div className="mx-auto flex w-full max-w-page flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-10 pt-7">
          {header}
          <EmptyState
            title={products.length === 1 ? 'Add one more product to compare.' : 'Pick at least two products to compare.'}
            action={
              <a href={searchHref} className="text-[15px] underline underline-offset-2">
                {category ? `Browse ${cfg.noun}` : 'Browse products'}
              </a>
            }
          >
            Use the Compare toggle on any result card — up to {MAX} products.
          </EmptyState>
        </div>
      </AppShell>
    );
  }

  const insights = await getInsights(client, products.map((p) => p.id));
  const byId = new Map(rankProducts(products, insights, weights, { config: cfg }).map((r) => [r.product.id, r]));
  const ranked = products.map((p) => byId.get(p.id)!); // keep the order the shopper picked
  const [verdict, table] = await Promise.all([compareVerdictAI(ranked, weights, cfg), Promise.resolve(compareTable(ranked, cfg))]);
  const winner = ranked.find((r) => r.product.id === verdict.winnerId) ?? ranked[0];
  const cur = store.currency.code;
  const n = ranked.length;
  const cols = { gridTemplateColumns: `minmax(150px,180px) repeat(${n}, minmax(220px, 1fr))` };
  const minW = { minWidth: `${180 + n * 220}px` };
  const isWin = (id: string) => id === winner.product.id;
  const per = new Map(verdict.perProduct.map((p) => [p.productId, p]));

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-page flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-10 pt-7">
        {header}

        <section aria-label="Our verdict" className="flex flex-wrap items-center justify-between gap-4 rounded-panel bg-ink px-5 py-[18px] text-white">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
            <Kicker tone="onDark">Our verdict</Kicker>
            <p className="m-0 text-[18px] font-semibold leading-snug">{verdict.text}</p>
            <Kicker tone="onDark" className="text-[11px] opacity-80">{verdict.source === 'ai' ? 'AI verdict' : 'Based on ratings & specs'}</Kicker>
          </div>
          <a
            href={storePath(store, `/product/${winner.product.id}`)}
            className="inline-flex min-h-11 items-center rounded-pill bg-accent px-5 text-[15px] font-semibold text-ink no-underline hover:bg-accent-hover hover:text-ink"
          >
            Choose {shortTitle(winner.product.title)} →
          </a>
        </section>

        <div className="relative overflow-x-auto rounded-panel border border-line bg-surface" role="region" aria-label="Comparison table" tabIndex={0}>
          <div style={minW} role="table" aria-label={`Comparing ${n} products`}>
            <div role="row" className="grid" style={cols}>
              <div role="columnheader" className="p-4 font-mono text-[12px] text-ink-3">{n} products</div>
              {ranked.map((r) => {
                const p = r.product;
                const href = storePath(store, `/product/${p.id}`);
                return (
                  <div role="columnheader" key={p.id} className={cn('flex flex-col gap-2 border-l border-line-2 p-4', isWin(p.id) && 'bg-surface-3')}>
                    <div className="flex min-h-[22px] items-center justify-between gap-2">
                      {isWin(p.id) ? <TopPickBadge>Best match</TopPickBadge> : <span />}
                      <RemoveFromCompare id={p.id} name={shortTitle(p.title, 6)} href={hrefWithout(p.id)} className="text-[13px] text-ink-3 underline underline-offset-2">
                        Remove
                      </RemoveFromCompare>
                    </div>
                    <a href={href} tabIndex={-1} aria-hidden className="block"><ProductFrame src={p.image} alt="" /></a>
                    <a href={href} className="line-clamp-3 text-[17px] font-semibold leading-tight text-ink no-underline hover:underline">{p.title}</a>
                    <div className="flex items-baseline justify-between gap-2">
                      <strong className="text-[20px] tabular-nums">{formatMoney(toStoreMinor(p.priceMinor, cur, p.curBase), cur)}</strong>
                      <span className="text-[13px]"><span aria-hidden className="text-star">★</span> {p.rating.toFixed(1)}<span className="sr-only"> out of 5 stars</span></span>
                    </div>
                    <MatchBadge match={r.match} className="self-start" />
                  </div>
                );
              })}
            </div>

            <div role="row" className="grid border-t border-line" style={cols}>
              <div role="rowheader" className="p-4 text-[15px] font-semibold">Quick verdict</div>
              {ranked.map((r) => {
                const v = per.get(r.product.id);
                return (
                  <div role="cell" key={r.product.id} className={cn('flex flex-col gap-3 border-l border-line-2 p-4', isWin(r.product.id) && 'bg-surface-3')}>
                    <div className="flex flex-col gap-0.5">
                      <Kicker>Best for</Kicker>
                      <span className="text-[16px] font-semibold">{v?.bestFor || '—'}</span>
                    </div>
                    {v?.strengths.length ? (
                      <div className="flex flex-col gap-1">
                        <Kicker>Strengths</Kicker>
                        <CheckList good={v.strengths} />
                      </div>
                    ) : null}
                    {v?.tradeoffs.length ? (
                      <div className="flex flex-col gap-1">
                        <Kicker>Trade-offs</Kicker>
                        <CheckList warn={v.tradeoffs} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {table.rows.length ? (
              <>
                <div role="row" className="grid border-t border-line bg-surface-3" style={cols}>
                  <div role="rowheader" className="px-4 py-3.5 text-[15px] font-semibold">What&apos;s different?</div>
                  {ranked.map((r) => <div role="cell" key={r.product.id} className="border-l border-line-2" />)}
                </div>
                {table.rows.map((row) => (
                  <div role="row" key={row.label} className="grid border-t border-line-2" style={cols}>
                    <div role="rowheader" className="px-4 py-3 text-[14px] text-ink-2">{row.label}</div>
                    {row.cells.map((cell, i) => (
                      <div
                        role="cell"
                        key={ranked[i].product.id}
                        className={cn(
                          'flex items-center justify-between gap-2 border-l border-line-2 px-4 py-3 text-[15px]',
                          cell.best && 'font-semibold',
                          isWin(ranked[i].product.id) && 'bg-surface-3',
                        )}
                      >
                        <span>{cell.text}</span>
                        {cell.best ? <span className="font-mono text-[11px] text-good-strong">BEST<span className="sr-only"> in this row</span></span> : null}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : null}

            {table.same.length ? (
              <div role="row" className="border-t border-line">
                <div role="cell" className="px-4 py-3.5 text-[14px] leading-normal text-ink-2">
                  <strong className="text-ink">Same on all:</strong> {table.same.join(' · ')}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

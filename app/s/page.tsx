import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Pagination } from '@/components/commerce/Pagination';
import { EmptyState, Kicker } from '@/components/decision/Badges';
import { Pill } from '@/components/decision/Pill';
import { SegmentedControl } from '@/components/decision/SegmentedControl';
import { QuizButton } from '@/components/quiz/QuizDialog';
import { decodeProfile, PROFILE_COOKIE } from '@/components/quiz/profileCookie';
import { ContinueRow } from '@/components/home/HomeSections';
import { ResultCard } from '@/components/results/ResultCard';
import { savedIdsFor } from '@/components/results/viewerSaved';
import { MoreFilters } from '@/components/search/MoreFilters';
import { PrioritiesPanel } from '@/components/search/PrioritiesPanel';
import { parseSearchQuery } from '@/lib/ai/features/parseQuery';
import { budgetRange, decisionConfig, findPreset, weightsFor } from '@/lib/decision/attributes';
import { readDecisionParams } from '@/lib/decision/params';
import { buildParsedQuery } from '@/lib/decision/query';
import type { RankSort } from '@/lib/decision/rank';
import { niceCeiling, rankedSearch } from '@/lib/decision/server';
import { listProducts, searchCatalog, variantSummaries } from '@/lib/data/catalog';
import { spellFix } from '@/lib/data/spell';
import { formatMoney } from '@/lib/marketplaces';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { parseQuery as parseFacets, pricePresets } from '@/lib/search';
import { searchMetadata } from '@/lib/seo';
import { storeCategories } from '@/lib/storefront';
import { db } from '@/lib/supabase/server';
import { plusMembership } from '@/lib/data/plus';
import { couponPercents } from '@/lib/data/coupons';
import { deliveryOptions } from '@/lib/decision/tracking';
import { dayLabel } from '@/components/orders/format';

type SP = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const store = await getMarketplace();
  return searchMetadata(store.id, store.name, await storeCategories(), (one(sp, 'k') ?? '').trim().slice(0, 200), one(sp, 'dept'), Number(one(sp, 'page') ?? 1));
}

const PER_PAGE = 12;

const SORT_OPTIONS: { value: RankSort; label: string }[] = [
  { value: 'match', label: 'Best match' },
  { value: 'price-asc', label: 'Lowest price' },
  { value: 'price-desc', label: 'Highest price' },
  { value: 'rating', label: 'Rating' },
];

const RANK_NOTE: Record<RankSort, string> = {
  match: 'Ranked by match with your priorities',
  'price-asc': 'Lowest price first',
  'price-desc': 'Highest price first',
  rating: 'Highest rated first',
};

function one(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Ranked search (prototype Search screen). URL scheme (all shareable, SSR without JS):
 *   k      free text, parsed by parseSearchQuery (AI when configured, else rules)
 *   dept   department slug (overrides the detected one); `all` = category chip removed
 *   budget ceiling in minor units; `0` = budget chip removed
 *   min    lowest price in minor units ("Price" in More filters)
 *   use    use-case preset from the query; `none` = use chip removed
 *   preset refine preset id, or `ai` = weights tuned by the quiz (summary in the `tuned_profile` cookie)
 *   orig   the query as typed, when `k` is its spelling correction ("Search instead for …")
 *   spell  `0` = search exactly as typed, no spelling correction
 *   w      custom weights "battery.5,comfort.4"  ·  sort  match|price-asc|rating  ·  page
 *   brand, rating, deal — "More filters" facets
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const store = await getMarketplace();
  const categories = await storeCategories();

  const k = (one(sp, 'k') ?? '').trim().slice(0, 200);
  const deptRaw = one(sp, 'dept');
  const parsed = k ? await parseSearchQuery(store.id, k, categories) : null;

  // effective state: explicit params override what the query parser understood
  const deptValid = deptRaw && categories.some((c) => c.slug === deptRaw) ? deptRaw : null;
  const category = deptRaw === 'all' ? null : deptValid ?? parsed?.category ?? null;
  const decision = readDecisionParams(sp, category, store.id);
  const useRaw = one(sp, 'use');
  const useCandidate = useRaw === 'none' ? null : useRaw ? decision.use : parsed?.use ?? null;
  const use = useCandidate && findPreset(category, useCandidate) ? useCandidate : null;
  const budgetRaw = one(sp, 'budget');
  const budgetMinor = budgetRaw === '0' ? null : budgetRaw ? decision.budgetMinor : parsed?.budgetMinor ?? null;
  const tuned = one(sp, 'preset') === 'ai';
  const preset = decision.preset;
  const weights = decision.weights ?? weightsFor(category, preset ?? use);
  const sort = decision.sort;
  const facets = parseFacets(sp);
  const brands = facets.brand ?? [];
  const cfg = decisionConfig(category);

  const overridden = category !== (parsed?.category ?? null) || budgetMinor !== (parsed?.budgetMinor ?? null) || use !== (parsed?.use ?? null);
  const pq = buildParsedQuery(
    store.id,
    { keywords: parsed?.keywords ?? '', category, budgetMinor, use, title: overridden ? undefined : parsed?.title },
    categories,
    parsed?.source ?? 'rules',
    k,
  );

  const client = await db();
  const [result, scope, saved, jar, plus] = await Promise.all([
    rankedSearch(store.id, pq, weights, budgetMinor, { brand: brands, rating: facets.rating, deal: facets.deal, minPrice: facets.minPrice, sort }, client),
    searchCatalog(client, store.id, { k: pq.keywords || undefined, dept: category ?? undefined, sort: 'featured', page: 1 }).catch(() => null),
    savedIdsFor(store.id),
    cookies(),
    plusMembership(client),
  ]);
  // the same standard-delivery day the product page and checkout promise
  const now = new Date();
  const delivery = { day: dayLabel(new Date(deliveryOptions(now, store.dates.timeZone).standard), store, now), member: plus != null };

  // ── hrefs ────────────────────────────────────────────────────────────────
  const raw = new URLSearchParams();
  for (const [key, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => raw.append(key, x));
    else if (v !== undefined) raw.set(key, v);
  }
  const hrefWith = (patch: Record<string, string | null>, keepPage = false) => {
    const out = new URLSearchParams(raw);
    for (const [key, v] of Object.entries(patch)) (v == null ? out.delete(key) : out.set(key, v));
    if (!keepPage) out.delete('page');
    const qs = out.toString().replace(/%2C/gi, ',');
    return storePath(store, qs ? `/s?${qs}` : '/s');
  };
  // nothing matched the words as typed: retry with typos corrected (only when that finds something)
  const orig = (one(sp, 'orig') ?? '').trim().slice(0, 200) || null;
  if (k && pq.keywords && !result.candidates && !result.pricedOut && !orig && one(sp, 'spell') !== '0' && !brands.length && !facets.rating && !facets.deal) {
    const fix = await spellFix(client, store.id, k, pq.keywords, category);
    if (fix) redirect(hrefWith({ k: fix.query, orig: k }));
  }

  // client base: materialise the parsed use so client-computed implied weights match the server
  const clientBase = new URLSearchParams(raw);
  if (use && !clientBase.get('use')) clientBase.set('use', use);
  clientBase.delete('page');

  // ── chips ────────────────────────────────────────────────────────────────
  const removeHref: Record<string, string> = {
    dept: hrefWith({ dept: 'all', w: null, preset: null, brand: null, use: null }),
    budget: hrefWith({ budget: '0' }),
    use: hrefWith({ use: 'none', w: null, preset: null }),
  };
  const chips: { label: string; href?: string }[] = pq.intents.map((i) => ({ label: i.label, href: i.removable ? removeHref[i.param] : undefined }));
  if (tuned) chips.push({ label: 'Tuned from your answers', href: hrefWith({ preset: null, w: null }) });
  for (const b of brands) chips.push({ label: b, href: hrefWith({ brand: brands.filter((x) => x !== b).join(',') || null }) });
  if (facets.rating) chips.push({ label: `${facets.rating}★ & up`, href: hrefWith({ rating: null }) });
  if (facets.deal) chips.push({ label: 'On sale', href: hrefWith({ deal: null }) });
  if (facets.minPrice) chips.push({ label: `${formatMoney(facets.minPrice, store.currency.code)} & above`, href: hrefWith({ min: null }) });

  const presetSpec = findPreset(category, preset ?? use);
  /** the refine pill that matches the current weights (a parsed use counts until hand-tuned) */
  const activePreset = tuned ? null : preset ?? (decision.weights ? null : use);
  const presetLabel = tuned ? 'Tuned for you' : preset ? presetSpec?.label ?? 'Custom' : decision.weights ? 'Custom' : use ? presetSpec?.label ?? 'Balanced' : 'Balanced';

  // ── quiz / profile ───────────────────────────────────────────────────────
  const stored = tuned ? decodeProfile(jar.get(PROFILE_COOKIE)?.value) : null;
  const storedForHere = stored && stored.category === (category ?? stored.category) ? stored : null;
  const quizCommon = { market: store.id, category, categories, baseQuery: clientBase.toString(), budgetMinor } as const;
  const profileSlot = tuned ? (
    <div className="flex flex-col gap-1.5 rounded-input bg-surface-2 p-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">
        {storedForHere?.profile.source === 'ai' ? 'Tuned by AI from your answers' : 'Tuned from your answers'}
      </span>
      <span className="text-[14px] leading-snug">{storedForHere?.profile.summary || 'Ranked with the priorities from your quiz answers.'}</span>
      {storedForHere ? (
        <QuizButton {...quizCommon} initial={storedForHere} className="self-start text-[13px] underline underline-offset-2">See why</QuizButton>
      ) : null}
    </div>
  ) : (
    <QuizButton {...quizCommon} className="flex flex-col gap-0.5 rounded-input border-[1.5px] border-dashed border-ink bg-surface p-3 text-left hover:bg-bg">
      <span className="text-[14px] font-semibold">Not sure? Answer 5 quick questions</span>
      <span className="text-[13px] text-ink-2">We&apos;ll set these for you and explain why.</span>
    </QuizButton>
  );

  // ── results ──────────────────────────────────────────────────────────────
  const total = result.total;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pageCount, Math.max(1, Number(one(sp, 'page')) || 1));
  const items = result.items.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  // nothing found: something to go on instead of a dead end (not in a price range — these could cost anything)
  const popular = items.length || budgetMinor || facets.minPrice ? [] : await listProducts(client, store.id, { category: category ?? undefined, order: 'popular', limit: 8 }).catch(() => []);
  const facetFilters = brands.length + (facets.rating ? 1 : 0) + (facets.deal ? 1 : 0) + (facets.minPrice ? 1 : 0);
  // products, not options: a group's variants count once
  const scopeTotal = scope && !facetFilters ? Math.max(scope.groups, result.candidates) : result.candidates;
  const [variants, coupons] = await Promise.all([
    variantSummaries(client, store.id, items.flatMap((r) => (r.product.variant ? [r.product.variant.group] : []))),
    couponPercents(client, items.map((r) => r.product.id)),
  ]);
  const range = budgetRange(store.id, category);
  const cur = store.currency.code;
  const title = pq.title === 'Results' ? 'All products' : pq.title;

  const widened = budgetMinor ? Math.min(niceCeiling(Math.round(budgetMinor * 1.5)), range.maxMinor) : null;
  const empty = budgetMinor ? (
    <EmptyState
      title={`Nothing fits under ${formatMoney(budgetMinor, cur)}.`}
      action={
        widened && widened > budgetMinor ? (
          <a href={hrefWith({ budget: String(widened) })} className="text-[15px] underline underline-offset-2">Widen budget to {formatMoney(widened, cur)}</a>
        ) : (
          <a href={hrefWith({ budget: '0' })} className="text-[15px] underline underline-offset-2">Remove the budget</a>
        )
      }
    >
      {facetFilters ? 'Your filters narrow it further — try removing one.' : null}
    </EmptyState>
  ) : facets.minPrice ? (
    <EmptyState
      title={`Nothing at ${formatMoney(facets.minPrice, cur)} & above.`}
      action={<a href={hrefWith({ min: null })} className="text-[15px] underline underline-offset-2">Remove the price filter</a>}
    >
      {facetFilters > 1 ? 'Your filters narrow it further — try removing one.' : null}
    </EmptyState>
  ) : (
    <EmptyState
      title={k ? `No matches for “${k}”.` : 'Nothing matches these filters.'}
      action={
        <a href={category ? storePath(store, `/s?dept=${encodeURIComponent(category)}`) : storePath(store, '/s')} className="text-[15px] underline underline-offset-2">
          {category ? `Browse all ${cfg.noun}` : 'Browse everything'}
        </a>
      }
    >
      Try fewer words or remove a filter.
    </EmptyState>
  );

  return (
    <AppShell query={k || undefined}>
      <div className="mx-auto flex w-full max-w-page flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-10 pt-7">
        <header className="flex flex-col gap-2">
          {orig && k ? (
            <p className="m-0 text-[15px] text-ink-2" role="status">
              Showing results for <strong className="font-semibold text-ink">{k}</strong>.{' '}
              <a href={hrefWith({ k: orig, orig: null, spell: '0' })} className="text-ink underline underline-offset-2">
                Search instead for {orig}
              </a>
            </p>
          ) : null}
          <Kicker>{k ? `You searched “${k}”` : 'Browse'}</Kicker>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">{title}</h1>
          <p className="m-0 text-[15px] text-ink-2">
            <strong className="text-ink">{total.toLocaleString('en-US')} best {total === 1 ? 'match' : 'matches'}</strong> from{' '}
            {scopeTotal.toLocaleString('en-US')} results, ranked by what you told us matters
          </p>
          {parsed ? (
            <Kicker className="text-[11px]">{parsed.source === 'ai' ? 'Query understood by AI' : 'Query understood by rules'}</Kicker>
          ) : null}
        </header>

        {chips.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] text-ink-3">We understood:</span>
            {chips.map((c) => (
              <Pill key={c.label} selected size="sm" removeHref={c.href} removeLabel={`Remove ${c.label}`}>
                {c.label}
              </Pill>
            ))}
          </div>
        ) : null}

        <section aria-labelledby="refine-title" className="flex flex-col gap-2.5">
          <h2 id="refine-title" className="m-0 text-[16px] font-semibold">Refine what matters</h2>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {cfg.presets.map((p) => (
              <Pill key={p.id} selected={activePreset === p.id} href={hrefWith({ preset: p.id, w: null, sort: null })}>
                {p.label}
              </Pill>
            ))}
            <QuizButton
              {...quizCommon}
              className="inline-flex min-h-10 flex-none items-center rounded-pill border-[1.5px] border-dashed border-ink bg-surface px-[15px] text-[14px] font-semibold hover:bg-surface-2"
            >
              Tune for me…
            </QuizButton>
          </div>
        </section>

        <div className="flex flex-wrap items-start gap-6">
          <aside aria-label="Your priorities" className="min-w-0 flex-[1_1_270px] lg:sticky lg:top-[120px] lg:max-h-[calc(100vh-136px)] lg:overflow-y-auto">
            <PrioritiesPanel
              market={store.id}
              category={category}
              attributes={cfg.attributes.map((a) => ({ key: a.key, label: a.label }))}
              weights={weights}
              presetLabel={presetLabel}
              currency={cur}
              budget={{ valueMinor: budgetMinor, minMinor: range.minMinor, maxMinor: range.maxMinor, stepMinor: range.stepMinor, floorMinor: facets.minPrice ?? null }}
              baseQuery={clientBase.toString()}
              resetHref={hrefWith({ w: null, preset: null, sort: null })}
              profileSlot={profileSlot}
              activeFilters={facetFilters}
              filtersSlot={
                <MoreFilters
                  categories={categories}
                  dept={category}
                  brandFacets={scope?.brandFacets ?? []}
                  brands={brands}
                  rating={facets.rating}
                  deal={!!facets.deal}
                  pricePresets={pricePresets(range)}
                  minPrice={facets.minPrice ?? null}
                  maxPrice={budgetMinor}
                  hrefWith={(patch) => hrefWith(patch)}
                />
              }
            />
          </aside>

          <section aria-label="Results" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[14px] text-ink-2">{RANK_NOTE[sort]}</span>
              <SegmentedControl
                ariaLabel="Sort results"
                value={sort}
                options={SORT_OPTIONS.map((o) => ({ ...o, href: hrefWith({ sort: o.value === 'match' ? null : o.value }) }))}
                className="no-scrollbar max-w-full overflow-x-auto whitespace-nowrap"
              />
            </div>
            {items.length ? (
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5 p-0">
                {items.map((r, i) => (
                  <li key={r.product.id} className="flex">
                    <div className="flex w-full flex-col [&>article]:flex-1">
                      <ResultCard
                        ranked={r}
                        store={store}
                        top={page === 1 && i === 0 && sort === 'match' && r.product.stock > 0}
                        saved={saved.has(r.product.id)}
                        bestForFallback={presetSpec?.bestFor}
                        priority={page === 1 && i < 3}
                        variants={r.product.variant ? variants.get(r.product.variant.group) : undefined}
                        delivery={delivery}
                        couponPct={coupons.get(r.product.id)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {empty}
                {popular.length ? (
                  <section aria-labelledby="popular-h" className="flex flex-col gap-3 pt-2">
                    <h2 id="popular-h" className="m-0 text-[20px] font-semibold">{category ? `Popular in ${cfg.noun}` : 'Popular right now'}</h2>
                    <ContinueRow products={popular} store={store} kicker="Popular" />
                  </section>
                ) : null}
              </>
            )}
            {pageCount > 1 ? <Pagination page={page} pageCount={pageCount} hrefFor={(n) => hrefWith({ page: n === 1 ? null : String(n) }, true)} /> : null}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

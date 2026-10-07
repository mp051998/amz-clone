import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';
import { AppShell } from '@/components/AppShell';
import { Breadcrumbs } from '@/components/commerce/Breadcrumbs';
import { MatchBadge } from '@/components/decision/Badges';
import { CheckList } from '@/components/decision/CheckList';
import { Price } from '@/components/primitives/Price';
import { Stars } from '@/components/primitives/Stars';
import { Alternatives, type AlternativeCard } from '@/components/product/Alternatives';
import { BackLink } from '@/components/product/BackLink';
import { BoughtTogether, type BundleEntry } from '@/components/product/BoughtTogether';
import { ratingText, sellerRatings, type SellerRating } from '@/lib/data/seller-feedback';
import { BuyPanel, LOW_STOCK, type ConfidenceRow } from '@/components/product/BuyPanel';
import { byTimeText, dayLabel, orderWithinText } from '@/components/orders/format';
import { Gallery } from '@/components/product/Gallery';
import { VariantPicker } from '@/components/product/VariantPicker';
import { RecordView } from '@/components/product/RecordView';
import { ShareButton } from '@/components/product/ShareButton';
import { loadReviewData, Reviews } from '@/components/product/Reviews';
import { QuestionsPanel } from '@/components/product/QuestionsPanel';
import { ReportIssue } from '@/components/product/ReportIssue';
import { scoreRows, Specs, type SpecGroup } from '@/components/product/Specs';
import { UnavailablePanel } from '@/components/product/UnavailablePanel';
import { FrequentlyReturned } from '@/components/product/FrequentlyReturned';
import { frequentlyReturned } from '@/lib/data/return-signal';
import { BrowsingHistory } from '@/components/product/BrowsingHistory';
import { readUser } from '@/lib/auth';
import { getProvider } from '@/lib/ai';
import { summarizeReviews } from '@/lib/ai/features/reviews';
import { getProduct, getProductInfo } from '@/lib/data/catalog';
import { listChoices, type ListChoice } from '@/lib/data/collections';
import { messageFor } from '@/lib/data/errors';
import { deliveryOptions } from '@/lib/decision/tracking';
import { decisionConfig } from '@/lib/decision/attributes';
import { effectiveWeights, readDecisionParams } from '@/lib/decision/params';
import { shortTitle } from '@/lib/decision/verdict';
import { rankOne, scoresFor } from '@/lib/decision/rank';
import { alternativesFor, boughtTogether, getInsight } from '@/lib/decision/server';
import type { ProductInsight } from '@/lib/decision/types';
import { deliverLabel } from '@/lib/deliver-to';
import { readDeliverTo } from '@/lib/deliver-to-server';
import { toStoreMinor } from '@/lib/fx';
import { storePath } from '@/lib/marketplace';
import { getMarketplace } from '@/lib/marketplace-server';
import { siteOrigin } from '@/lib/origin';
import { zoomImage } from '@/lib/product-images';
import { recentProducts } from '@/lib/recent-products';
import { bestsellerRank } from '@/lib/bestseller-rank';
import { jsonLdHtml, productDescription, productJsonLd, productUrl } from '@/lib/seo';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';
import { plusMembership } from '@/lib/data/plus';
import { couponFor, couponUnitSavings } from '@/lib/data/coupons';
import { CouponToggle } from '@/components/coupons/CouponToggle';
import { countAnsweredQuestions, listQuestions, type QuestionPage } from '@/lib/data/questions';
import { myOpenReport } from '@/lib/data/product-reports';
import type { Product } from '@/lib/types';

type SP = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getProduct(await db(), id, { includeArchived: true });
  if (!p) return { title: 'Page not found · Store' };
  const title = `${p.title} · Store`;
  const description = productDescription(p);
  const images = p.image ? [{ url: zoomImage(p.image), alt: p.title }] : undefined;
  return {
    title,
    description,
    // one address per product (its own store, no decision params)
    alternates: { canonical: productUrl(p) },
    openGraph: { type: 'website', siteName: 'Store', title: p.title, description, url: productUrl(p), locale: p.market === 'IN' ? 'en_IN' : 'en_US', images },
    twitter: { card: images ? 'summary_large_image' : 'summary', title: p.title, description, images: images?.map((i) => i.url) },
    // archived products keep their page (links, order history, reviews) but leave search engines
    ...(p.archived ? { robots: { index: false } } : {}),
  };
}

/** Decision params that travel with product links (search → PDP → alternatives). */
const CARRY = ['w', 'preset', 'use', 'budget'] as const;

function carryQuery(sp: SP): string {
  const out = new URLSearchParams();
  for (const k of CARRY) {
    const v = sp[k];
    const one = Array.isArray(v) ? v[0] : v;
    if (one) out.set(k, one);
  }
  const s = out.toString();
  return s ? `?${s}` : '';
}

/** Don't re-kick a background AI summary for the same product more than every 10 minutes per process. */
const AI_KICKED = new Map<string, number>();
const AI_RETRY_MS = 10 * 60 * 1000;

function kickAiSummary(productId: string) {
  const last = AI_KICKED.get(productId) ?? 0;
  if (Date.now() - last < AI_RETRY_MS) return;
  AI_KICKED.set(productId, Date.now());
  after(async () => {
    try {
      await summarizeReviews(productId);
    } catch (err) {
      console.warn('[pdp] AI summary failed:', (err as Error).message);
    }
  });
}

/** Prototype "Why people buy it" copy: a bare attribute label reads as "<label> is a standout". */
function prosFor(p: Product, insight: ProductInsight | null, fallback: string[]): string[] {
  const labels = new Set(decisionConfig(p.category).attributes.map((a) => a.label.toLowerCase()));
  const src = insight?.pros.length ? insight.pros : fallback;
  return src.slice(0, 3).map((t) => (labels.has(t.trim().toLowerCase()) ? `${t.trim()} is a standout` : t));
}

function thingsToKnow(p: Product, insight: ProductInsight | null, warn: string | null): string[] {
  const out = [...(insight?.cons ?? [])];
  if (warn && !out.includes(warn)) out.push(warn);
  if (p.stock > 0 && p.stock <= LOW_STOCK) out.push(`Only ${p.stock} left in stock`);
  return [...new Set(out)].slice(0, 3);
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const client = await db();
  const p = await getProduct(client, id, { includeArchived: true });
  if (!p) notFound();

  const store = await getMarketplace();
  // each store sells its own catalog — send a cross-store link to the product's home store
  if (p.market !== store.id) redirect(storePath({ id: p.market }, `/product/${encodeURIComponent(p.id)}`));

  const user = await readUser();
  const decision = readDecisionParams(sp, p.category, store.id);
  const tuned = CARRY.some((k) => k !== 'budget' && sp[k]);
  const weights = effectiveWeights(decision, p.category);
  const cfg = decisionConfig(p.category);

  const [insight, reviews, alts, lists, info, bundle, deliverTo, recent, rank, plus, coupon, questions, answered, sellers, myReport, returnSignal] = await Promise.all([
    getInsight(p.id, client),
    loadReviewData(client, p.id, user?.id ?? null),
    alternativesFor(p, 3, weights, client).catch(() => []),
    user ? listChoices(client, store.id, p.id).catch((): ListChoice[] => []) : Promise.resolve(null),
    getProductInfo(client, p.id),
    boughtTogether(p, 2, client).catch(() => []),
    readDeliverTo(store.id),
    recentProducts(client, store.id, { exclude: [p.id] }),
    p.archived ? Promise.resolve(null) : bestsellerRank(client, p).catch(() => null),
    user ? plusMembership(client) : Promise.resolve(null),
    p.archived ? Promise.resolve(null) : couponFor(client, p.id, user != null),
    listQuestions(client, p.id, user?.id ?? null, { limit: 10 }).catch((): QuestionPage => ({ items: [], total: 0 })),
    countAnsweredQuestions(client, p.id),
    sellerRatings(client, store.id, [p.seller]).catch(() => new Map<string, SellerRating>()),
    user && !p.archived ? myOpenReport(client, p.id, user.id).catch(() => null) : Promise.resolve(null),
    p.archived ? Promise.resolve(null) : frequentlyReturned(client, p.id).catch(() => null),
  ]);
  const sellerRating = sellers.get(p.seller);

  const ranked = rankOne(p, insight, weights);
  const aiPending = !p.archived && insight?.source !== 'ai' && reviews.page.total > 0 && getProvider() != null;
  if (aiPending) kickAiSummary(p.id);

  const cur = store.currency.code;
  const money = (minor: number, base = p.curBase) => formatMoney(toStoreMinor(minor, cur, base), cur);
  const priceMinor = toStoreMinor(p.priceMinor, cur, p.curBase);
  const listMinor = p.listMinor ? toStoreMinor(p.listMinor, cur, p.curBase) : undefined;
  const num = (n: number) => n.toLocaleString(store.locale.default);
  const ratingCount = reviews.summary.count || p.reviewCount;
  const rating = reviews.summary.count ? reviews.summary.rating : p.rating;
  const here = `/product/${encodeURIComponent(p.id)}`;
  const qs = carryQuery(sp);

  // Purchase confidence: rating × volume × written-review signal
  const written = reviews.page.items;
  const verifiedPct = written.length ? Math.round((written.filter((r) => r.verified).length / written.length) * 100) : null;
  const level: 'High' | 'Medium' | 'Low' = rating >= 4.3 && ratingCount >= 50 ? 'High' : rating >= 3.8 && ratingCount >= 5 ? 'Medium' : 'Low';
  const confidence: ConfidenceRow[] = [
    { k: 'Rating', v: ratingCount ? `${rating.toFixed(1)} / 5 · ${num(ratingCount)} ratings` : 'No ratings yet' },
    ...(verifiedPct != null ? [{ k: 'Verified reviews', v: `${verifiedPct}% of ${num(written.length)} shown` }] : []),
    { k: 'Returns', v: `${store.returns.days}-day refund` },
    { k: 'Sold by', v: sellerRating ? `${p.seller} · ${sellerRating.positivePct}% positive` : p.seller },
  ];

  const threshold = store.delivery.freeThresholdMinor;
  // the same schedule checkout and order tracking use
  const now = new Date();
  const options = deliveryOptions(now, store.dates.timeZone);
  const delivery = {
    member: store.membership.name,
    // members get standard and faster delivery free on every order
    headline: plus ? 'FREE delivery with your membership' : priceMinor >= threshold ? 'FREE delivery' : `FREE delivery on orders over ${formatMoney(threshold, cur)}`,
    promise: dayLabel(new Date(options.standard), store, now),
    fastest: options.fast ? byTimeText(new Date(options.fast), store, now) : undefined,
    fastFree: plus != null,
    orderWithin: options.fastBy ? orderWithinText(now, new Date(options.fastBy)) ?? undefined : undefined,
    to: deliverTo.current ? `to ${deliverLabel(deliverTo.current)}` : undefined,
  };

  const bundleEntries: BundleEntry[] = bundle.length
    ? [p, ...bundle.map((b) => b.product)].map((x) => ({
        id: x.id,
        title: shortTitle(x.title, 12),
        image: x.image,
        href: storePath(store, `/product/${encodeURIComponent(x.id)}`),
        priceMinor: toStoreMinor(x.priceMinor, cur, x.curBase),
        current: x.id === p.id,
      }))
    : [];
  const altCards: AlternativeCard[] = alts.map((a) => ({
    id: a.product.id,
    name: a.product.title,
    image: a.product.image,
    href: storePath(store, `/product/${encodeURIComponent(a.product.id)}${qs}`),
    priceText: money(a.product.priceMinor, a.product.curBase),
    rating: a.product.rating,
    diff: a.diff,
    match: tuned ? a.match : undefined,
  }));

  const bestsellersHref = storePath(store, `/bestsellers?c=${encodeURIComponent(p.category)}`);
  const scores = scoresFor(p, insight);
  // the info table leads with its own Brand / Author row; the General group repeats it only without one
  const namesMaker = info.details.some(([k]) => /^(brand|author|manufacturer)$/i.test(k));
  // with the open group, like Amazon's product details
  const rankRow = rank ? [{ k: 'Best Sellers Rank', v: <a href={bestsellersHref} className="text-ink underline underline-offset-2">#{num(rank)} in {p.categoryName}</a> }] : [];
  const specs: SpecGroup[] = [
    { name: 'Product information', open: true, rows: [...info.details.map(([k, v]) => ({ k, v })), ...(info.details.length ? rankRow : [])] },
    {
      name: 'General',
      open: !info.details.length,
      rows: [
        ...(namesMaker ? [] : [{ k: 'Brand', v: p.brand ?? 'Generic' }]),
        { k: 'Category', v: <a href={storePath(store, `/s?dept=${encodeURIComponent(p.category)}`)} className="text-ink underline underline-offset-2">{p.categoryName}</a> },
        ...(info.details.length ? [] : rankRow),
        {
          k: 'Sold by',
          v: (
            <>
              <a href={storePath(store, `/seller?name=${encodeURIComponent(p.seller)}`)} className="text-ink underline underline-offset-2">{p.seller}</a>
              {sellerRating ? <span className="text-ink-2"> · {ratingText(sellerRating)}</span> : null}
            </>
          ),
        },
        { k: 'Ships from', v: p.shipsFrom },
        { k: 'Availability', v: p.archived ? 'No longer available' : p.stock > 0 ? `In stock (${num(p.stock)})` : 'Out of stock' },
      ],
    },
    { name: 'About this item', rows: p.bullets.map((b) => ({ v: b })) },
    {
      name: 'Scores',
      rows: scoreRows(cfg.attributes.filter((a) => scores[a.key] != null).map((a) => ({ label: a.label, score: scores[a.key] }))),
    },
  ];

  const trail = [
    { label: 'Home', href: storePath(store, '/') },
    { label: p.categoryName, href: storePath(store, `/s?dept=${encodeURIComponent(p.category)}`) },
  ];

  const structured = p.archived ? null : productJsonLd(p, await siteOrigin(), { rating, count: ratingCount });

  return (
    <AppShell>
      {structured ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(structured) }} /> : null}
      {p.archived ? null : <RecordView productId={p.id} />}
      <div className="mx-auto flex w-full max-w-page flex-col gap-11 px-[clamp(16px,3vw,24px)] pb-10 pt-[22px]">
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <BackLink fallbackHref={storePath(store, '/s')} />
            <div className="flex items-center gap-3">
              <Breadcrumbs trail={trail} className="hidden sm:block" />
              {p.archived ? null : <ShareButton title={p.title} path={productUrl(p)} image={p.image ? zoomImage(p.image) : undefined} />}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-7">
            <div className="min-w-0 flex-[1_1_400px] max-sm:basis-full">
              <Gallery images={[p.image, ...info.gallery].filter(Boolean)} alt={p.title} />
            </div>

            <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-[18px] max-sm:basis-full">
              <div className="flex flex-col gap-2">
                {p.brand ? (
                  <a href={storePath(store, `/s?brand=${encodeURIComponent(p.brand)}`)} className="self-start text-[14px] text-ink-2 no-underline hover:text-accent-ink">{p.brand}</a>
                ) : null}
                <h1 className="m-0 text-[clamp(24px,3vw,32px)] font-semibold leading-[1.12] tracking-[-0.01em] text-pretty">{p.title}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <a href="#insight" className="inline-flex min-h-8 items-center gap-1.5 text-[15px] text-ink no-underline">
                    <Stars rating={rating} size={16} />
                    <strong className="font-semibold tabular-nums">{rating.toFixed(1)}</strong>
                    <span className="text-ink-2 underline underline-offset-2">({num(ratingCount)} ratings)</span>
                  </a>
                  {answered ? (
                    <a href="#questions" className="inline-flex min-h-8 items-center border-l border-line-3 pl-3 text-[15px] text-ink-2 underline underline-offset-2 hover:text-ink">
                      {num(answered)} answered {answered === 1 ? 'question' : 'questions'}
                    </a>
                  ) : null}
                </div>
                {p.archived ? null : (
                  <div className="flex flex-wrap items-center gap-2">
                    <MatchBadge match={ranked.match} />
                    <span className="text-[13px] text-ink-3">{tuned ? 'for your priorities' : `for typical ${cfg.noun} priorities`}</span>
                  </div>
                )}
                {p.badge && !(rank === 1 && /best ?seller/i.test(p.badge)) ? (
                  <span className="self-start rounded-tag bg-ink px-1.5 py-0.5 text-[12px] font-bold text-on-ink">{p.badge}</span>
                ) : null}
                {rank === 1 ? (
                  <a href={bestsellersHref} className="inline-flex items-center gap-1.5 self-start text-[13px] text-ink-2 no-underline hover:text-ink">
                    <span className="rounded-tag bg-ink px-1.5 py-0.5 text-[12px] font-bold text-on-ink">#1 Best Seller</span>{' '}
                    <span>in <span className="underline underline-offset-2">{p.categoryName}</span></span>
                  </a>
                ) : null}
                {p.boughtPastMonth ? <span className="text-[13px] text-ink-2">{p.boughtPastMonth}</span> : null}
                {returnSignal ? <FrequentlyReturned signal={returnSignal} reviewsHref="#reviews" /> : null}
              </div>

              {p.archived ? null : (
                <div className="flex flex-col gap-1 border-t border-line pt-4">
                  <Price minor={priceMinor} currency={cur} listMinor={listMinor} listLabel={store.pricing.listLabel} size={32} />
                  {p.deal ? <span className="text-[13px] font-semibold text-warn-strong">Limited-time deal</span> : null}
                  {coupon ? (
                    <CouponToggle
                      productId={p.id}
                      percentOff={coupon.percentOff}
                      clipped={coupon.clipped}
                      signedIn={user != null}
                      market={store.id}
                      savingText={formatMoney(couponUnitSavings(priceMinor, coupon.percentOff), cur)}
                      next={`/product/${encodeURIComponent(p.id)}`}
                    />
                  ) : null}
                  {store.pricing.taxNote ? <span className="text-[12px] text-ink-3">{store.pricing.taxNote}</span> : null}
                </div>
              )}

              {info.variants ? (
                <VariantPicker
                  axis={info.variants.axis}
                  label={info.variants.label}
                  options={info.variants.options.map((o) => ({
                    ...o,
                    href: storePath(store, `/product/${encodeURIComponent(o.id)}${qs}`),
                    priceText: money(o.priceMinor),
                  }))}
                />
              ) : null}

              {prosFor(p, insight, ranked.why).length ? (
                <div className="flex flex-col gap-2">
                  <h2 className="m-0 text-[17px] font-semibold">Why people buy it</h2>
                  <CheckList good={prosFor(p, insight, ranked.why)} size="md" />
                </div>
              ) : null}
              {thingsToKnow(p, insight, ranked.warn).length ? (
                <div className="flex flex-col gap-2">
                  <h2 className="m-0 text-[17px] font-semibold">Things to know</h2>
                  <CheckList warn={thingsToKnow(p, insight, ranked.warn)} size="md" />
                </div>
              ) : null}
              {insight?.bestFor ? (
                <p className="m-0 text-[15px]"><strong className="font-semibold">Best for:</strong> {insight.bestFor}</p>
              ) : null}
            </div>

            <aside aria-label="Buy" className="min-w-0 flex-[1_1_280px] max-sm:basis-full">
              {p.archived ? (
                <UnavailablePanel categoryName={p.categoryName} categoryHref={storePath(store, `/s?dept=${encodeURIComponent(p.category)}`)} />
              ) : (
                <BuyPanel
                  productId={p.id}
                  name={p.title}
                  image={p.image}
                  category={p.category}
                  categoryName={p.categoryName}
                  market={store.id}
                  stock={p.stock}
                  saved={lists?.some((l) => l.has) ?? false}
                  lists={lists}
                  delivery={delivery}
                  confidence={{ level, rows: confidence }}
                  error={messageFor(Array.isArray(sp.error) ? sp.error[0] : sp.error)}
                />
              )}
            </aside>
          </div>
        </div>

        {bundleEntries.length > 1 ? (
          <section aria-labelledby="fbt-h" className="flex max-w-[980px] flex-col gap-3">
            {/* only order data earns "Frequently bought together"; rules picks are just suggestions */}
            <h2 id="fbt-h" className="m-0 text-[22px] font-semibold">{bundle.every((b) => b.source === 'orders') ? 'Frequently bought together' : 'Goes well with this'}</h2>
            <BoughtTogether productId={p.id} items={bundleEntries} currency={cur} />
          </section>
        ) : null}

        <Reviews
          data={reviews}
          productId={p.id}
          signedIn={Boolean(user)}
          defaultName={user?.name ?? ''}
          signinHref={storePath(store, `/signin?next=${encodeURIComponent(`${here}#reviews`)}`)}
          profileBase={storePath(store, '/profile/')}
          locale={store.locale.default}
          timeZone={store.dates.timeZone}
          insight={insight ? { summary: insight.summary, praised: insight.praised, criticized: insight.criticized, source: insight.source } : null}
          aiPending={aiPending}
        />

        <QuestionsPanel
          productId={p.id}
          initial={questions}
          signedIn={Boolean(user)}
          signinHref={storePath(store, `/signin?next=${encodeURIComponent(`${here}#questions`)}`)}
          canAsk={!p.archived}
          locale={store.locale.default}
          timeZone={store.dates.timeZone}
        />

        {altCards.length ? (
          <section aria-labelledby="alts-h" className="flex flex-col gap-3.5">
            <h2 id="alts-h" className="m-0 text-[22px] font-semibold">{p.archived ? 'Similar items on sale' : 'Often compared with'}</h2>
            <Alternatives base={{ id: p.id, name: p.title, image: p.image, category: p.category, categoryName: p.categoryName }} items={altCards} />
          </section>
        ) : null}

        <section aria-labelledby="specs-h" className="flex max-w-[860px] flex-col gap-3">
          <h2 id="specs-h" className="m-0 text-[22px] font-semibold">Specifications</h2>
          <Specs groups={specs} />
        </section>

        {info.description ? (
          <section aria-labelledby="desc-h" className="flex max-w-[860px] flex-col gap-3">
            <h2 id="desc-h" className="m-0 text-[22px] font-semibold">Product description</h2>
            <p className="m-0 whitespace-pre-line text-[15px] leading-relaxed text-ink-2 text-pretty">{info.description}</p>
          </section>
        ) : null}

        {p.archived ? null : (
          <section id="report" aria-label="Report an issue" className="flex max-w-[860px] flex-col gap-2 border-t border-line pt-4">
            <ReportIssue
              productId={p.id}
              signedIn={Boolean(user)}
              signinHref={storePath(store, `/signin?next=${encodeURIComponent(`${here}#report`)}`)}
              open={myReport}
              locale={store.locale.default}
              timeZone={store.dates.timeZone}
            />
          </section>
        )}

        <BrowsingHistory products={recent} store={store} />
      </div>
    </AppShell>
  );
}

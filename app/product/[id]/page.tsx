import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { after } from 'next/server';
import { AppShell } from '@/components/AppShell';
import { Breadcrumbs } from '@/components/commerce/Breadcrumbs';
import { MatchBadge } from '@/components/decision/Badges';
import { CheckList } from '@/components/decision/CheckList';
import { Alert } from '@/components/primitives/Alert';
import { Price } from '@/components/primitives/Price';
import { Stars } from '@/components/primitives/Stars';
import { Alternatives, type AlternativeCard } from '@/components/product/Alternatives';
import { BackLink } from '@/components/product/BackLink';
import { BoughtTogether, type BundleEntry } from '@/components/product/BoughtTogether';
import { LastPurchased } from '@/components/product/LastPurchased';
import { ratingText, sellerRatings, type SellerRating } from '@/lib/data/seller-feedback';
import { BuyPanel, LOW_STOCK, type ConfidenceRow } from '@/components/product/BuyPanel';
import { byTimeText, dayLabel, longDate, orderWithinText, releaseDate } from '@/components/orders/format';
import { Gallery } from '@/components/product/Gallery';
import { VariantPicker } from '@/components/product/VariantPicker';
import { RecordView } from '@/components/product/RecordView';
import { ShareButton } from '@/components/product/ShareButton';
import { loadReviewData, Reviews } from '@/components/product/Reviews';
import { QuestionsPanel } from '@/components/product/QuestionsPanel';
import { ReportIssue } from '@/components/product/ReportIssue';
import { LowerPrice } from '@/components/product/LowerPrice';
import { scoreRows, Specs, type SpecGroup } from '@/components/product/Specs';
import { UnavailablePanel } from '@/components/product/UnavailablePanel';
import { FrequentlyReturned, UsuallyKept } from '@/components/product/FrequentlyReturned';
import { categoryReturnPolicy, returnPolicyText } from '@/lib/data/return-policy';
import { exchangeOffer } from '@/lib/data/exchange';
import { exchangeUpTo, exchangeValue, KIND_LABEL } from '@/lib/exchange';
import { returnSignal as readReturnSignal, type ReturnSignal } from '@/lib/data/return-signal';
import { BrowsingHistory } from '@/components/product/BrowsingHistory';
import { readUser } from '@/lib/auth';
import { getProvider } from '@/lib/ai';
import { summarizeReviews } from '@/lib/ai/features/reviews';
import { getProduct, getProductInfo } from '@/lib/data/catalog';
import { listChoices, type ListChoice } from '@/lib/data/collections';
import { messageFor } from '@/lib/data/errors';
import { deliveryOptions } from '@/lib/decision/tracking';
import { releaseOf } from '@/lib/pre-order';
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
import { qtyDiscountText } from '@/lib/qty-discount';
import { unitPriceText, unitSizeText } from '@/lib/unit-price';
import { db } from '@/lib/supabase/server';
import { plusMembership } from '@/lib/data/plus';
import { couponFor, couponUnitSavings } from '@/lib/data/coupons';
import { CouponToggle } from '@/components/coupons/CouponToggle';
import { countAnsweredQuestions, listQuestions, type QuestionPage } from '@/lib/data/questions';
import { myOpenPriceReport } from '@/lib/data/lower-price';
import { myOpenReport } from '@/lib/data/product-reports';
import { getRecall, type Recall } from '@/lib/data/recalls';
import { lastPurchase, type LastPurchase } from '@/lib/data/buy-again';
import type { LightningDeal, Product } from '@/lib/types';
import { protectionOffer } from '@/lib/data/cart';
import { alsoBought } from '@/lib/data/also-bought';
import { alsoViewed } from '@/lib/data/also-viewed';
import { ContinueRow } from '@/components/home/HomeSections';
import { protectionPlanName } from '@/lib/protection';
import { emiPlans } from '@/lib/emi';
import { EmiOffer } from '@/components/product/EmiOffer';
import { BankOffers } from '@/components/product/BankOffers';
import { ProductPerks } from '@/components/product/ProductPerks';
import { ClimateBadge, ClimateFeatures } from '@/components/product/ClimatePledge';
import { SmallBusinessBadge, SmallBusinessPanel } from '@/components/product/SmallBusiness';
import { getSmallBusiness } from '@/lib/data/small-businesses';
import { productPerks } from '@/components/product/perks';
import { listBankOffers } from '@/lib/data/bank-offers';
import { PromoOffers } from '@/components/product/PromoOffers';
import { activePromoCodes } from '@/lib/data/promo';
import { promosFor } from '@/lib/promo';
import { purchaseAllowance } from '@/lib/data/purchase-limits';
import { unitsLeft } from '@/lib/purchase-limits';
import { asksFit, FIT_LABELS } from '@/lib/review-fit';
import { featuresFor } from '@/lib/review-features';
import { listOffers } from '@/lib/data/offers';
import { kindsLabel, offerSummary } from '@/lib/offers';
import { SubscribeSave } from '@/components/product/SubscribeSave';
import { subscriptionFor } from '@/lib/data/subscriptions';
import { snsPriceMinor, storeDay } from '@/lib/subscribe-save';
import { OtherSellers } from '@/components/product/Offers';
import { LightningDealInfo } from '@/components/deals/LightningDeal';
import { WatchDeal } from '@/components/deals/WatchDeal';
import { watchedDeals } from '@/lib/data/deal-watches';
import { lightningDealsFor } from '@/lib/data/lightning-deals';
import { offerItem } from '@/components/product/offerItems';

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
/** Offers shown in the product page's "Other sellers on Amazon" (the rest are a link away). */
const OTHER_SELLERS = 3;

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
  // another seller's offer is sold from its product's page (an error from adding it goes along)
  if (p.offerOf) {
    const error = typeof sp.error === 'string' ? `?error=${encodeURIComponent(sp.error)}` : '';
    redirect(storePath({ id: p.market }, `/product/${encodeURIComponent(p.offerOf)}${error}`));
  }

  const store = await getMarketplace();
  // each store sells its own catalog — send a cross-store link to the product's home store
  if (p.market !== store.id) redirect(storePath({ id: p.market }, `/product/${encodeURIComponent(p.id)}`));

  const user = await readUser();
  const decision = readDecisionParams(sp, p.category, store.id);
  const tuned = CARRY.some((k) => k !== 'budget' && sp[k]);
  const weights = effectiveWeights(decision, p.category);
  const cfg = decisionConfig(p.category);

  // other sellers' offers (none before the offers migration lands, or off sale)
  const offersP = p.archived ? Promise.resolve([]) : listOffers(client, p.id).catch((): Product[] => []);
  // its brand's story, when it's a small business's
  const smallBusinessP = p.smallBusiness && p.brand ? getSmallBusiness(client, store.id, p.brand).catch(() => null) : Promise.resolve(null);
  const [insight, reviews, alts, lists, info, bundle, deliverTo, recent, rank, plus, coupon, questions, answered, sellers, myReport, returnSignal, planMinor, promos, allowance, alsoSeen, recall, lastBought, alsoGot, offers, mySub, lightning, bankOffers, returnPolicy, myPrice, trade] = await Promise.all([
    getInsight(p.id, client),
    loadReviewData(client, p.id, user?.id ?? null, { fit: asksFit(p), features: featuresFor(p) }),
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
    offersP.then((o) => sellerRatings(client, store.id, [...new Set([p.seller, ...o.slice(0, OTHER_SELLERS).map((x) => x.seller)])])).catch(() => new Map<string, SellerRating>()),
    user && !p.archived ? myOpenReport(client, p.id, user.id).catch(() => null) : Promise.resolve(null),
    p.archived ? Promise.resolve(null) : readReturnSignal(client, p.id).catch((): ReturnSignal | null => null),
    p.archived ? Promise.resolve(null) : protectionOffer(client, p.id).catch(() => null),
    p.archived ? Promise.resolve([]) : activePromoCodes(client, store.id),
    user && p.maxPerCustomer ? purchaseAllowance(client, store.id, [p.id]) : Promise.resolve(new Map()),
    p.archived ? Promise.resolve([]) : alsoViewed(client, p).catch(() => []),
    // a recall takes a product off sale, so only an archived one can have one
    p.archived ? getRecall(client, p.id).catch((): Recall | null => null) : Promise.resolve(null),
    // bought from any of its sellers
    user ? offersP.then((o) => lastPurchase(client, user.id, [p.id, ...o.map((x) => x.id)])).catch((): LastPurchase | null => null) : Promise.resolve(null),
    p.archived ? Promise.resolve([]) : alsoBought(client, p).catch(() => []),
    offersP,
    user && p.subscribeSave && !p.archived ? subscriptionFor(client, p.id) : Promise.resolve(null),
    p.archived ? Promise.resolve(new Map<string, LightningDeal>()) : lightningDealsFor(client, [p.id]),
    p.archived ? Promise.resolve([]) : listBankOffers(client, store.id),
    categoryReturnPolicy(client, store.id, p.category, store.returns.days),
    user && !p.archived ? myOpenPriceReport(client, p.id, user.id).catch(() => null) : Promise.resolve(null),
    p.archived ? Promise.resolve(null) : exchangeOffer(client, store.id, p.category),
  ]);
  const smallBusiness = await smallBusinessP;
  const sellerRating = sellers.get(p.seller);

  const ranked = rankOne(p, insight, weights);
  const aiPending = !p.archived && insight?.source !== 'ai' && reviews.page.total > 0 && getProvider() != null;
  if (aiPending) kickAiSummary(p.id);

  const cur = store.currency.code;
  const money = (minor: number, base = p.curBase) => formatMoney(toStoreMinor(minor, cur, base), cur);
  const deal = lightning.get(p.id);
  const watchingDeal = user && deal?.state === 'upcoming' ? (await watchedDeals(client, [deal.id])).has(deal.id) : false;
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
    { k: 'Returns', v: returnPolicyText(returnPolicy.days, returnPolicy.replacementOnly) },
    { k: 'Sold by', v: sellerRating ? `${p.seller} · ${sellerRating.positivePct}% positive` : p.seller },
  ];

  const threshold = store.delivery.freeThresholdMinor;
  // amazon.in's icons under the price
  const perks = p.archived || store.id !== 'IN'
    ? []
    : productPerks({
        priceMinor,
        freeThresholdMinor: threshold,
        member: plus ? store.membership.name : undefined,
        cod: store.payments.some((m) => m.method === 'cod'),
        returnDays: returnPolicy.days,
        replacementOnly: returnPolicy.replacementOnly,
        money: (minor) => formatMoney(minor, cur),
      });
  // the same schedule checkout and order tracking use
  const now = new Date();
  // a pre-order arrives once it's out, with no faster option
  const release = releaseOf(p, now);
  const options = deliveryOptions(now, store.dates.timeZone, null, release);
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

  // "Add all to cart" adds one of each, so a product that comes in sizes (picked on its own page) sits it out
  const bundled = p.sizes ? [] : bundle.filter((b) => !b.product.sizes);
  const bundleEntries: BundleEntry[] = bundled.length
    ? [p, ...bundled.map((b) => b.product)].map((x) => ({
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

  // "Other sellers on Amazon": the cheapest few, and every way to buy it (its own offer too, when it can be)
  const otherSellers = offers.slice(0, OTHER_SELLERS).map((x) => offerItem(x, { store, priceText: money(x.priceMinor, x.curBase), rating: sellers.get(x.seller) }));
  const offerTotals = offerSummary(p.stock > 0 ? [p, ...offers] : offers);

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
        ...(p.unit ? [{ k: 'Unit count', v: unitSizeText(p.unit) }] : []),
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

          {recall ? (
            <Alert tone="error">
              <p className="m-0 font-semibold">This product has been recalled</p>
              <p className="m-0"><span className="font-semibold">Hazard:</span> {recall.hazard}</p>
              <p className="m-0"><span className="font-semibold">What to do:</span> {recall.remedy}</p>
              <a href={storePath(store, `/recalls#recall-${encodeURIComponent(p.id)}`)} className="text-ink underline underline-offset-2">Recalls and Product Safety Alerts</a>
            </Alert>
          ) : null}

          {lastBought ? (
            <LastPurchased last={lastBought} orderHref={storePath(store, `/orders/${encodeURIComponent(lastBought.orderId)}?placed=0`)} store={store} />
          ) : null}

          <div className="flex flex-wrap items-start gap-7">
            <div className="min-w-0 flex-[1_1_400px] max-sm:basis-full">
              <Gallery images={[p.image, ...info.gallery].filter(Boolean)} alt={p.title} />
            </div>

            <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-[18px] max-sm:basis-full">
              <div className="flex flex-col gap-2">
                {p.brand ? (
                  <a href={storePath(store, `/stores/${encodeURIComponent(p.brand)}`)} className="self-start text-[14px] text-ink-2 no-underline hover:text-accent-ink">Visit the {p.brand} Store</a>
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
                {p.climate?.length ? <ClimateBadge href="#climate" /> : null}
                {p.smallBusiness ? <SmallBusinessBadge href={smallBusiness ? '#small-business' : undefined} /> : null}
                {p.boughtPastMonth ? <span className="text-[13px] text-ink-2">{p.boughtPastMonth}</span> : null}
                {returnSignal?.frequent ? <FrequentlyReturned signal={returnSignal.frequent} reviewsHref="#reviews" /> : null}
                {returnSignal?.usuallyKept ? <UsuallyKept /> : null}
              </div>

              {p.archived ? null : (
                <div className="flex flex-col gap-1 border-t border-line pt-4">
                  <Price minor={priceMinor} currency={cur} listMinor={listMinor} listLabel={store.pricing.listLabel} size={32} unitText={p.unit ? unitPriceText(priceMinor, cur, p.unit) : undefined} />
                  {deal ? (
                    <>
                      <LightningDealInfo deal={deal} money={(minor) => money(minor)} />
                      {deal.state === 'upcoming' ? <WatchDeal dealId={deal.id} watching={watchingDeal} name={p.title} market={store.id} className="mt-1.5 max-w-[240px] flex-none self-start" /> : null}
                    </>
                  ) : p.deal ? (
                    <span className="text-[13px] font-semibold text-warn-strong">Limited-time deal</span>
                  ) : null}
                  <EmiOffer plans={emiPlans(store.id, priceMinor)} currency={cur} />
                  <BankOffers offers={bankOffers} currency={cur} />
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
                  {p.qtyDiscount ? (
                    <span className="flex items-center gap-1.5 text-[14px] text-ink-2">
                      <span className="rounded-tag bg-good-bg px-1.5 py-0.5 text-[12px] font-bold text-good-strong">Buy more, save</span>
                      {qtyDiscountText(p.qtyDiscount)}
                    </span>
                  ) : null}
                  <PromoOffers promos={promosFor(promos, p.category)} currency={cur} allHref={storePath(store, '/coupons#promo-codes')} />
                  {store.pricing.taxNote ? <span className="text-[12px] text-ink-3">{store.pricing.taxNote}</span> : null}
                </div>
              )}
              <ProductPerks perks={perks} />

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

              {reviews.fit ? (
                <a href="#fit" className="self-start text-[14px] text-ink underline-offset-2 hover:underline">
                  <strong className="font-semibold">Fit: {FIT_LABELS[reviews.fit.verdict]}</strong>
                  <span className="text-ink-2"> · {reviews.fit.pct[reviews.fit.verdict]}% of {num(reviews.fit.total)} shoppers who said</span>
                </a>
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
                  protection={planMinor ? { name: protectionPlanName(store.id), price: formatMoney(planMinor, cur) } : undefined}
                  limit={p.maxPerCustomer ? { max: p.maxPerCustomer, left: user ? unitsLeft(p, allowance) : null } : undefined}
                  sizes={p.sizes}
                  fit={p.sizes?.length ? returnSignal?.fit : null}
                  preOrder={release ? { release: releaseDate(new Date(release), store) } : undefined}
                  exchange={
                    trade
                      ? {
                          kind: KIND_LABEL[trade.kind],
                          upTo: formatMoney(exchangeUpTo(trade.devices, priceMinor), cur),
                          devices: trade.devices.map((d) => ({
                            id: d.id,
                            brand: d.brand,
                            model: d.model,
                            good: formatMoney(exchangeValue(d.valueMinor, 'good', priceMinor), cur),
                            damaged: formatMoney(exchangeValue(d.valueMinor, 'screen_damaged', priceMinor), cur),
                          })),
                        }
                      : undefined
                  }
                />
              )}
              {p.subscribeSave && !p.archived && (p.stock > 0 || mySub) ? (
                <SubscribeSave
                  productId={p.id}
                  priceText={money(snsPriceMinor(p.priceMinor))}
                  listText={money(p.priceMinor)}
                  maxQty={p.stock}
                  setupHref={storePath(store, '/subscribe-save/new')}
                  subscribed={mySub ? { qty: mySub.qty, everyMonths: mySub.everyMonths, nextText: longDate(storeDay(mySub.nextOn), store), manageHref: storePath(store, '/subscribe-save') } : undefined}
                />
              ) : null}
              {otherSellers.length && offerTotals ? (
                <OtherSellers
                  name={p.title}
                  offers={otherSellers}
                  allHref={storePath(store, `/product/${encodeURIComponent(p.id)}/offers`)}
                  allLabel={`${kindsLabel(offerTotals)} (${num(offerTotals.count)}) from ${money(offerTotals.fromMinor)}`}
                />
              ) : null}
            </aside>
          </div>
        </div>

        {bundleEntries.length > 1 ? (
          <section aria-labelledby="fbt-h" className="flex max-w-[980px] flex-col gap-3">
            {/* only order data earns "Frequently bought together"; rules picks are just suggestions */}
            <h2 id="fbt-h" className="m-0 text-[22px] font-semibold">{bundled.every((b) => b.source === 'orders') ? 'Frequently bought together' : 'Goes well with this'}</h2>
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
          askFit={asksFit(p)}
          askFeatures={featuresFor(p)}
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

        {alsoGot.length ? (
          <section aria-labelledby="also-bought-h" className="flex flex-col gap-3.5">
            <h2 id="also-bought-h" className="m-0 text-[22px] font-semibold">Customers who bought this item also bought</h2>
            <ContinueRow products={alsoGot} store={store} kicker={(x) => x.brand ?? x.categoryName} />
          </section>
        ) : null}

        {alsoSeen.length ? (
          <section aria-labelledby="also-viewed-h" className="flex flex-col gap-3.5">
            <h2 id="also-viewed-h" className="m-0 text-[22px] font-semibold">Customers who viewed this item also viewed</h2>
            <ContinueRow products={alsoSeen} store={store} kicker={(x) => x.brand ?? x.categoryName} />
          </section>
        ) : null}

        <section aria-labelledby="specs-h" className="flex max-w-[860px] flex-col gap-3">
          <h2 id="specs-h" className="m-0 text-[22px] font-semibold">Specifications</h2>
          <Specs groups={specs} />
        </section>

        {p.climate?.length ? <ClimateFeatures certs={p.climate} /> : null}

        {smallBusiness ? <SmallBusinessPanel business={smallBusiness} storeHref={storePath(store, `/stores/${encodeURIComponent(smallBusiness.brand)}`)} /> : null}

        {info.description ? (
          <section aria-labelledby="desc-h" className="flex max-w-[860px] flex-col gap-3">
            <h2 id="desc-h" className="m-0 text-[22px] font-semibold">Product description</h2>
            <p className="m-0 whitespace-pre-line text-[15px] leading-relaxed text-ink-2 text-pretty">{info.description}</p>
          </section>
        ) : null}

        {p.archived || p.offerOf ? null : (
          <section id="lower-price" aria-label="Tell us about a lower price" className="flex max-w-[860px] flex-col gap-2 border-t border-line pt-4">
            <LowerPrice
              productId={p.id}
              priceMinor={p.priceMinor}
              currency={cur}
              signedIn={Boolean(user)}
              signinHref={storePath(store, `/signin?next=${encodeURIComponent(`${here}#lower-price`)}`)}
              open={myPrice}
              locale={store.locale.default}
              timeZone={store.dates.timeZone}
            />
          </section>
        )}

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

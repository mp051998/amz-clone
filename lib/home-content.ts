import type { HomeCampaign, HomeModule, PublicMarketplace } from './contracts';
import type { Db } from './db/client';
import type { Category, Product } from './types';
import { getProducts, listCategories, listProducts } from './data/catalog';
import { getInsights } from './data/insights';
import { weightsFor } from './decision/attributes';
import { rankProducts } from './decision/rank';
import { shortTitle } from './decision/verdict';
import { storePath } from './marketplace';
import { formatMoney } from './marketplaces';
import { toStoreMinor } from './fx';

/** Legacy merchandising card (kept for the configured-modules resolver below). */
export interface MerchandisingCardData {
  id: string;
  title: string;
  cta: string;
  href: string;
  items: { image: string; alt: string; href: string; label: string }[];
}

export interface HomeContent {
  campaign: HomeCampaign;
  cards: MerchandisingCardData[];
  rails: { id: string; title: string; products: Product[] }[];
  showPay: boolean;
}

const CARD_TITLES: Record<PublicMarketplace['id'], Record<string, string>> = {
  US: {
    electronics: 'Discover electronics',
    'home-kitchen': 'Kitchen essentials',
    beauty: 'Beauty picks for you',
    computers: 'Level up your setup',
  },
  IN: {
    electronics: 'Headphones & audio',
    'home-kitchen': 'Refresh your home & kitchen',
    fashion: 'Trending in fashion',
    beauty: 'Beauty essentials',
  },
};

/**
 * Resolve the store's configured home modules (campaign, merchandising grid, deal rails) against the
 * live catalog. Legacy amazon-style home — the decision-store home uses `getDecisionHome` below; this
 * stays because the store config still carries these modules (covered by test/integration).
 */
export async function getHomeContent(db: Db, store: PublicMarketplace): Promise<HomeContent> {
  const campaignModule = store.ui.home.find((module) => module.kind === 'campaign');
  if (!campaignModule) throw new Error(`Missing home campaign for ${store.id}`);

  const categories: Category[] = await listCategories(db, store.id);
  const categoryName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;
  const cards: HomeContent['cards'] = [];
  const rails: HomeContent['rails'] = [];

  for (const module of store.ui.home) {
    if (module.kind === 'merchandising-grid') {
      const perCard = await Promise.all(module.cardIds.map((slug) => listProducts(db, store.id, { category: slug, limit: 4 })));
      module.cardIds.forEach((slug, i) => {
        const products = perCard[i];
        if (!products.length) return;
        const title = CARD_TITLES[store.id][slug] ?? categoryName(slug);
        const startingPrice = Math.min(...products.map((product) => toStoreMinor(product.priceMinor, store.currency.code, product.curBase)));
        cards.push({
          id: slug,
          title: store.id === 'IN' ? `${title} | From ${formatMoney(startingPrice, store.currency.code)}` : title,
          cta: `Shop ${categoryName(slug)}`,
          href: storePath(store, `/s?dept=${slug}`),
          items: products.map((product) => ({
            image: product.image,
            alt: product.title,
            href: storePath(store, `/product/${product.id}`),
            label: product.brand ?? product.title.split(/[\s,]+/).slice(0, 2).join(' '),
          })),
        });
      });
    } else if (module.kind === 'deal-rail') {
      rails.push(await resolveRail(db, module, store));
    }
  }

  return {
    campaign: { ...campaignModule.campaign, href: storePath(store, campaignModule.campaign.href) },
    cards,
    rails,
    showPay: store.id === 'IN',
  };
}

const RAIL_MAX = 14;

async function resolveRail(
  db: Db,
  module: Extract<HomeModule, { kind: 'deal-rail' }>,
  store: PublicMarketplace,
): Promise<HomeContent['rails'][number]> {
  // Curated ids lead the rail; top up with the market's other deals so the rail
  // isn't stranded at just the handful of hand-picked headliners.
  const [picked, deals] = await Promise.all([
    getProducts(db, module.productIds),
    listProducts(db, store.id, { dealsOnly: true, limit: RAIL_MAX * 2 }),
  ]);
  const curated = picked.filter((product) => product.market === store.id);
  const seen = new Set(curated.map((product) => product.id));
  const filler = deals.filter((product) => !seen.has(product.id));
  return {
    id: module.id,
    title: module.title,
    products: [...curated, ...filler].slice(0, RAIL_MAX),
  };
}

// ── decision-store home ─────────────────────────────────────────────────────

export interface HomePick {
  product: Product;
  /** "Because you viewed Sony WH-1000XM5" */
  reason: string;
  bestFor: string;
}

export interface HomeDeal {
  product: Product;
  /** "Ends in 5h" — today's deals end at midnight in the store's time zone. */
  ends: string;
}

export interface DecisionHome {
  /** recently viewed, newest first (empty → hide the section) */
  recent: Product[];
  picks: HomePick[];
  /** true when picks come from viewing history (else popular fallback) */
  personal: boolean;
  deals: HomeDeal[];
}

const PICKS_MAX = 8;
const DEALS_MAX = 6;

/** Hours/minutes left until midnight in `timeZone` ("Ends in 5h", "Ends in 40m"). */
export function endsLabel(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const left = 24 * 60 - (h * 60 + m);
  if (left < 60) return `Ends in ${Math.max(1, left)}m`;
  return `Ends in ${Math.floor(left / 60)}h`;
}

/**
 * Home sections for the decision store: Continue shopping (recently viewed ids from the
 * `recent:v1` cookie), Picks (ranked neighbours of what was viewed, else popular), and
 * Deals for you (deals in the viewed categories first).
 */
export async function getDecisionHome(db: Db, store: PublicMarketplace, recentIds: string[], now = new Date()): Promise<DecisionHome> {
  const recent = (await getProducts(db, recentIds)).filter((p) => p.market === store.id);
  const viewed = new Set(recent.map((p) => p.id));
  const interest = [...new Set(recent.map((p) => p.category))].slice(0, 3);

  const [pools, dealPool] = await Promise.all([
    interest.length
      ? Promise.all(interest.map((category) => listProducts(db, store.id, { category, order: 'popular', limit: 24 })))
      : listProducts(db, store.id, { order: 'popular', limit: 36 }).then((all) => [all]),
    listProducts(db, store.id, { dealsOnly: true, limit: 36 }),
  ]);

  const candidates = pools.flat().filter((p) => !viewed.has(p.id));
  const insights = await getInsights(db, candidates.map((p) => p.id));

  // rank each pool with its category's default weights, then interleave pools
  const rankedPools = pools.map((pool) => {
    const list = pool.filter((p) => !viewed.has(p.id) && p.stock > 0);
    return rankProducts(list, insights, weightsFor(list[0]?.category ?? null));
  });
  const picks: HomePick[] = [];
  const seen = new Set<string>();
  const perCategory = new Map<string, number>();
  const cap = interest.length ? PICKS_MAX : 2; // popular fallback: at most 2 per department
  for (let round = 0; picks.length < PICKS_MAX && rankedPools.some((l) => l.length > round); round++) {
    for (const list of rankedPools) {
      const r = list[round];
      if (!r || seen.has(r.product.id) || picks.length >= PICKS_MAX) continue;
      const used = perCategory.get(r.product.category) ?? 0;
      if (used >= cap) continue;
      seen.add(r.product.id);
      perCategory.set(r.product.category, used + 1);
      const anchor = recent.find((p) => p.category === r.product.category);
      const reason = anchor
        ? Math.abs(r.product.priceMinor - anchor.priceMinor) <= anchor.priceMinor * 0.4
          ? `Often compared with ${shortTitle(anchor.title)}`
          : `Because you viewed ${shortTitle(anchor.title)}`
        : `Popular in ${r.product.categoryName}`;
      picks.push({ product: r.product, reason, bestFor: r.insight?.bestFor ?? '' });
    }
  }

  const rank = (p: Product) => {
    const i = interest.indexOf(p.category);
    return i === -1 ? interest.length : i;
  };
  const ends = endsLabel(now, store.dates.timeZone);
  const deals = dealPool
    .filter((p) => !viewed.has(p.id) && p.stock > 0 && p.listMinor && p.listMinor > p.priceMinor)
    .sort((a, b) => rank(a) - rank(b) || (b.dealPct ?? 0) - (a.dealPct ?? 0))
    .slice(0, DEALS_MAX)
    .map((product) => ({ product, ends }));

  return { recent: recent.slice(0, 8), picks, personal: interest.length > 0, deals };
}

/**
 * Departments for the home page's "Best Sellers in …" rows: the ones the shopper viewed most
 * recently first, then the store's own department order.
 */
export function bestSellerDepts(recent: readonly Pick<Product, 'category'>[], categories: readonly Category[], n: number): Category[] {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const slugs = new Set([...recent.map((p) => p.category), ...categories.map((c) => c.slug)]);
  return [...slugs].flatMap((slug) => bySlug.get(slug) ?? []).slice(0, n);
}

/** "Good evening" by the store's local hour. */
export function greetingFor(now: Date, timeZone: string): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Store-aware example queries for the home hero (real categories, local currency). */
export function exampleQueries(store: Pick<PublicMarketplace, 'id'>): string[] {
  return store.id === 'IN'
    ? ['headphones for travel under ₹3,000', 'phone under ₹25,000 with long battery', 'running shoes under ₹2,000']
    : ['headphones for travel under $100', 'laptop for work under $800', 'air fryer under $150'];
}

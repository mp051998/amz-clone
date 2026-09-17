import type { MerchandisingCardData } from '../components/home/MerchandisingCard';
import type { HomeCampaign, HomeModule, PublicMarketplace } from './contracts';
import { categoriesFor, categoryName, deals, productsIn, type Product } from './catalog-market';
import { storePath } from './marketplace';
import { formatMoney } from './marketplaces';
import { toStoreMinor } from './fx';

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

/** Resolve configured modules through the active catalog; product records stay catalog-owned. */
export function getHomeContent(store: PublicMarketplace): HomeContent {
  const campaignModule = store.ui.home.find((module) => module.kind === 'campaign');
  if (!campaignModule) throw new Error(`Missing home campaign for ${store.id}`);

  const catalog = categoriesFor(store.id).flatMap((category) => productsIn(category.slug, store.id));
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const cards: HomeContent['cards'] = [];
  const rails: HomeContent['rails'] = [];

  for (const module of store.ui.home) {
    if (module.kind === 'merchandising-grid') {
      for (const slug of module.cardIds) {
        const products = productsIn(slug, store.id).slice(0, 4);
        if (!products.length) continue;
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
      }
    } else if (module.kind === 'deal-rail') {
      rails.push(resolveRail(module, byId, store));
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

function resolveRail(module: Extract<HomeModule, { kind: 'deal-rail' }>, byId: Map<string, Product>, store: PublicMarketplace): HomeContent['rails'][number] {
  // Curated ids lead the rail; top up with the market's other deals so the rail
  // isn't stranded at just the handful of hand-picked headliners.
  const curated = module.productIds.flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });
  const seen = new Set(curated.map((product) => product.id));
  const filler = deals(store.id).filter((product) => !seen.has(product.id));
  return {
    id: module.id,
    title: module.title,
    products: [...curated, ...filler].slice(0, RAIL_MAX),
  };
}

/**
 * What search engines and link previews read: product structured data (schema.org Product),
 * descriptions, robots rules and the sitemap. Pure; the app's metadata files feed it.
 */
import type { Metadata, MetadataRoute } from 'next';
import { HELP_TOPIC_SLUGS } from './help-topics';
import { legalSlugs } from './legal';
import { storePath } from './marketplace';
import { zoomImage } from './product-images';
import type { Category, Market, Product } from './types';

/** Pages both stores have (US at the path, India under /in), linked to each other as alternates. */
export const STORE_PAGES = [
  '/',
  '/deals',
  '/coupons',
  '/bestsellers',
  '/new-releases',
  '/renewed',
  '/gift-cards',
  '/prime',
  '/registry',
  '/customer-service',
  ...HELP_TOPIC_SLUGS.map((s) => `/customer-service/help/${s}`),
  '/sell',
  '/business',
  '/amazon-pay',
  '/prime-video',
  ...legalSlugs.map((s) => `/legal/${s}`),
] as const;

/** Per-shopper or private pages: nothing for a crawler there (each store). */
const PRIVATE = ['/admin', '/account', '/cart', '/checkout', '/orders', '/collections', '/lists/', '/history', '/compare', '/signin', '/auth/', '/api/'];

const DESCRIPTION_MAX = 160;

/** A product's page, in its own store. */
export function productUrl(p: Pick<Product, 'id' | 'market'>): string {
  return storePath({ id: p.market }, `/product/${encodeURIComponent(p.id)}`);
}

function abs(origin: string, path: string): string {
  return new URL(path, origin).href;
}

/** The large photo (link previews, image search); none when the product has no photo. */
function photos(p: Pick<Product, 'image'>, origin: string): string[] {
  return p.image ? [abs(origin, zoomImage(p.image))] : [];
}

/** The search-result / link-preview blurb: the first bullets, cut at a word near 160 characters. */
export function productDescription(p: Pick<Product, 'title' | 'brand' | 'categoryName' | 'bullets'>): string {
  // bullets are fragments; end each as a sentence so they don't run together
  const text = p.bullets.map((b) => b.trim()).filter(Boolean).map((b) => (/[.!?…]$/.test(b) ? b : `${b}.`)).join(' ');
  if (!text) return `${p.brand ? `${p.brand} ` : ''}${p.title}, in ${p.categoryName}.`;
  if (text.length <= DESCRIPTION_MAX) return text;
  const cut = text.slice(0, DESCRIPTION_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > DESCRIPTION_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/**
 * Title, blurb and indexing for the search page. A department (`/s?dept=…`, listed in the sitemap)
 * is a landing page: its own title and one canonical address whatever sort or filters ride along.
 * A typed search is titled with the shopper's words; crawlers follow its links but leave it out
 * of the index, so endless query variations don't compete with the real pages.
 */
export function searchMetadata(market: Market, storeName: string, categories: Category[], k: string, dept?: string, page = 1): Metadata {
  const cat = dept ? categories.find((c) => c.slug === dept) : undefined;
  if (k) return { title: `${cat ? `${k} in ${cat.name}` : k} · ${storeName}`, robots: { index: false, follow: true } };
  // each page of results is its own address (not folded into page 1)
  const qs = new URLSearchParams(cat ? { dept: cat.slug } : {});
  if (Number.isInteger(page) && page > 1) qs.set('page', String(page));
  const canonical = storePath({ id: market }, qs.size ? `/s?${qs}` : '/s');
  const paged = qs.has('page') ? ` · Page ${page}` : '';
  if (cat) {
    return {
      title: `${cat.name}${paged} · ${storeName}`,
      description: `Shop ${cat.name} at ${storeName}: every pick ranked by what matters to you, with its strengths and trade-offs.`,
      alternates: { canonical },
    };
  }
  return { title: `All products${paged} · ${storeName}`, alternates: { canonical } };
}

export interface ProductJsonLd {
  '@context': 'https://schema.org';
  '@type': 'Product';
  name: string;
  url: string;
  offers: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * schema.org Product for a product page: name, photo, brand, the offer (price in the product's own
 * currency, stock) and the rating shoppers gave it.
 */
export function productJsonLd(p: Product, origin: string, rating: { rating: number; count: number }): ProductJsonLd {
  const url = abs(origin, productUrl(p));
  const image = photos(p, origin);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    sku: p.id,
    ...(image.length ? { image } : {}),
    description: productDescription(p),
    category: p.categoryName,
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    url,
    offers: {
      '@type': 'Offer',
      url,
      // every store currency has two decimals (cents, paise)
      price: (p.priceMinor / 100).toFixed(2),
      priceCurrency: p.curBase,
      availability: `https://schema.org/${p.archived ? 'Discontinued' : p.stock > 0 ? 'InStock' : 'OutOfStock'}`,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: p.seller },
    },
    ...(rating.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.rating.toFixed(1), reviewCount: rating.count, bestRating: '5', worstRating: '1' } }
      : {}),
  };
}

/** JSON for a `<script type="application/ld+json">`; `<` is escaped so no value can end the script. */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** schema.org WebSite for a store's home: its name and how to search it (the sitelinks search box). */
export function websiteJsonLd(origin: string, market: Market, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: abs(origin, storePath({ id: market }, '/')),
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${abs(origin, storePath({ id: market }, '/s'))}?k={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function robotsRules(origin: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE.flatMap((p) => [p, `/in${p}`]) },
    sitemap: abs(origin, '/sitemap.xml'),
  };
}

export interface StoreCatalog {
  categories: Category[];
  products: Product[];
}

/** Every public page of both stores: shared pages (with their other-store alternate), departments, products. */
export function sitemapEntries(origin: string, stores: Record<Market, StoreCatalog>): MetadataRoute.Sitemap {
  const url = (market: Market, path: string) => abs(origin, storePath({ id: market }, path)).replace(/\/$/, '');
  const shared: MetadataRoute.Sitemap = STORE_PAGES.flatMap((path) => {
    const languages = { 'en-US': url('US', path), 'en-IN': url('IN', path), 'x-default': url('US', path) };
    const priority = path === '/' ? 1 : path.startsWith('/legal/') ? 0.2 : 0.7;
    return (['US', 'IN'] as const).map((m) => ({ url: url(m, path), changeFrequency: 'daily' as const, priority, alternates: { languages } }));
  });
  const catalog = (['US', 'IN'] as const).flatMap((m) => [
    ...stores[m].categories.map((c) => ({ url: url(m, `/s?dept=${encodeURIComponent(c.slug)}`), changeFrequency: 'daily' as const, priority: 0.6 })),
    ...stores[m].products.map((p) => ({ url: abs(origin, productUrl(p)), changeFrequency: 'weekly' as const, priority: 0.5, images: photos(p, origin) })),
  ]);
  return [...shared, ...catalog];
}

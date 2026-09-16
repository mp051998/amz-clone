import { AppShell } from '@/components/AppShell';
import { HeroCarousel, type HeroSlide } from '@/components/home/HeroCarousel';
import { CategoryCard, type CategoryCardItem } from '@/components/home/CategoryCard';
import { ProductRail } from '@/components/home/ProductRail';
import { PayStrip } from '@/components/home/PayStrip';
import { PromoRow } from '@/components/home/PromoRow';
import type { PromoTile, PromoDeal } from '@/components/home/PromoCard';
import { productsIn, deals, type Product } from '@/lib/catalog-market';
import type { Metadata } from 'next';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { toStoreMinor } from '@/lib/fx';
import { formatMoney } from '@/lib/marketplaces';
import type { PublicMarketplace } from '@/lib/contracts';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  const site = `Amazon.${store.hostname.split('.').pop()}`;
  return { title: `${site}. Spend less. Smile more.` };
}

/** short label for a card thumbnail: brand if present, else first two words of the title */
function shortLabel(p: Product): string {
  if (p.brand) return p.brand;
  return p.title.split(/[\s,]+/).slice(0, 2).join(' ');
}
function items(slug: string, store: PublicMarketplace, n = 4): CategoryCardItem[] {
  return productsIn(slug, store.id).slice(0, n).map((p) => ({ image: p.image, label: shortLabel(p), href: storePath(store, `/product/${p.id}`) }));
}
function heroImages(slug: string, store: PublicMarketplace, n = 4): string[] {
  return productsIn(slug, store.id).slice(0, n).map((p) => p.image);
}

/** amazon.in's lead module: a row of tall promo tiles (₹ price points, an Amazon
 *  Music panel, a "popular deals" grid), composed from real catalog imagery/prices. */
function promoTiles(store: PublicMarketplace): PromoTile[] {
  const cur = store.currency.code;
  const sym = store.currency.symbol;
  const sp = (p: string) => storePath(store, p);
  const img = (slug: string, i = 0) => productsIn(slug, store.id)[i]?.image ?? '';
  const dealItems: PromoDeal[] = deals(store.id).slice(0, 4).map((p) => ({
    image: p.image,
    price: formatMoney(toStoreMinor(p.priceMinor, cur, p.curBase), cur),
    list: p.listMinor ? formatMoney(toStoreMinor(p.listMinor, cur, p.curBase), cur) : undefined,
  }));
  return [
    { headline: `Under ${sym}1,499`, sub: 'Headphones & audio', tags: ['Top brands', 'Latest trends'], image: img('electronics'), cashback: true, href: sp('/s?dept=electronics') },
    { headline: `Starting ${sym}199`, sub: 'Kitchen essentials', tags: ['Best of home'], image: img('home-kitchen'), cashback: true, href: sp('/s?dept=home-kitchen') },
    { headline: '3 months FREE', sub: 'Unlimited music, ad-free', music: true, href: sp('/amazon-pay') },
    { headline: `Under ${sym}999`, sub: 'Sports & running shoes', tags: ['Top brands', 'Latest trends'], image: img('fashion'), cashback: true, href: sp('/s?dept=fashion') },
    { headline: 'Shop popular deals', sub: 'Top deals for you', deals: dealItems, href: sp('/deals') },
    { headline: 'Up to 55% off', sub: 'Laptops & PCs', tags: ['Big savings'], image: img('computers'), cashback: true, href: sp('/s?dept=computers') },
  ];
}

interface CardSpec { title: string; seeMore: { label: string; path: string }; slug: string }

/** amazon.com and amazon.in run the same home layout engine but surface different
 *  content: the US home leads with category deals, the IN home leads with the Great
 *  Indian Festival, ₹ price-point cards and an Amazon Pay / UPI strip. */
function homeContent(store: PublicMarketplace): { slides: HeroSlide[]; cards: CardSpec[]; rails: { title: string; slug: string; path: string }[]; showPay: boolean } {
  const sp = (path: string) => storePath(store, path);
  if (store.id === 'IN') {
    return {
      slides: [
        { eyebrow: 'Great Indian Festival', title: 'Lowest prices of the season', cta: 'Shop deals', href: sp('/s?dept=electronics'), bg: 'bg-gradient-to-r from-[#7a1f1f] via-[#b5341f] to-[#f0a52b]', images: heroImages('electronics', store) },
        { eyebrow: 'Home & kitchen', title: 'Appliances up to 55% off', cta: 'Shop home', href: sp('/s?dept=home-kitchen'), bg: 'bg-gradient-to-r from-[#5a3a1b] via-[#a4712c] to-[#e8b866]', images: heroImages('home-kitchen', store) },
        { eyebrow: 'Latest fashion', title: 'Trends starting ₹299', cta: 'Shop fashion', href: sp('/s?dept=fashion'), bg: 'bg-gradient-to-r from-[#7a2a5e] via-[#c15aa0] to-[#f0b8dc]', images: heroImages('fashion', store) },
        { eyebrow: 'Beauty fest', title: 'Beauty must-haves under ₹499', cta: 'Shop beauty', href: sp('/s?dept=beauty'), bg: 'bg-gradient-to-r from-[#8a2f5a] via-[#d16ba5] to-[#f6c6e0]', images: heroImages('beauty', store) },
      ],
      cards: [
        { title: 'Under ₹499 | Deals on Electronics', seeMore: { label: 'See all deals', path: '/s?dept=electronics' }, slug: 'electronics' },
        { title: 'Appliances & kitchen for your home', seeMore: { label: 'Shop Home & Kitchen', path: '/s?dept=home-kitchen' }, slug: 'home-kitchen' },
        { title: 'Beauty picks under ₹299', seeMore: { label: 'Shop Beauty', path: '/s?dept=beauty' }, slug: 'beauty' },
        { title: 'Upgrade your PC & gaming', seeMore: { label: 'Shop Computers', path: '/s?dept=computers' }, slug: 'computers' },
        { title: 'Starting ₹149 | Fitness gear', seeMore: { label: 'Shop Sports & Fitness', path: '/s?dept=sports' }, slug: 'sports' },
        { title: 'Trending in Fashion', seeMore: { label: 'Shop Fashion', path: '/s?dept=fashion' }, slug: 'fashion' },
        { title: 'Best sellers in Books', seeMore: { label: 'Shop Books', path: '/s?dept=books' }, slug: 'books' },
        { title: "Toys & games kids love", seeMore: { label: 'Shop Toys & Games', path: '/s?dept=toys' }, slug: 'toys' },
      ],
      rails: [
        { title: "Today's Deals", slug: '', path: '/deals' },
        { title: 'Great Indian Festival | Top picks in Electronics', slug: 'electronics', path: '/s?dept=electronics' },
        { title: 'Top deals in Home & Kitchen', slug: 'home-kitchen', path: '/s?dept=home-kitchen' },
      ],
      showPay: true,
    };
  }
  return {
    slides: [
      { eyebrow: 'Deals of the day', title: 'Save big on top electronics', cta: 'Shop deals', href: sp('/s?dept=electronics'), bg: 'bg-gradient-to-r from-[#0f1111] via-[#232f3e] to-[#4a5b6d]', images: heroImages('electronics', store) },
      { eyebrow: 'Home refresh', title: 'Kitchen & cookware picks', cta: 'Shop home', href: sp('/s?dept=home-kitchen'), bg: 'bg-gradient-to-r from-[#8a5a2b] via-[#c08838] to-[#f0c27b]', images: heroImages('home-kitchen', store) },
      { eyebrow: 'Glow up', title: 'Beauty must-haves', cta: 'Shop beauty', href: sp('/s?dept=beauty'), bg: 'bg-gradient-to-r from-[#a83279] via-[#d16ba5] to-[#f6c6e0]', images: heroImages('beauty', store) },
      { eyebrow: 'New & trending', title: 'Toys & games for every age', cta: 'Shop toys', href: sp('/s?dept=toys'), bg: 'bg-gradient-to-r from-[#1d6f6f] via-[#2aa198] to-[#7fd8cf]', images: heroImages('toys', store) },
    ],
    cards: [
      { title: 'Deals in Electronics', seeMore: { label: 'See all deals', path: '/s?dept=electronics' }, slug: 'electronics' },
      { title: 'Get fit at home', seeMore: { label: 'Shop Sports & Outdoors', path: '/s?dept=sports' }, slug: 'sports' },
      { title: 'Beauty picks for you', seeMore: { label: 'Shop Beauty', path: '/s?dept=beauty' }, slug: 'beauty' },
      { title: 'Level up your setup', seeMore: { label: 'Shop Computers', path: '/s?dept=computers' }, slug: 'computers' },
      { title: 'Kitchen essentials', seeMore: { label: 'Shop Home & Kitchen', path: '/s?dept=home-kitchen' }, slug: 'home-kitchen' },
      { title: 'Shoes for every run', seeMore: { label: 'Shop Fashion', path: '/s?dept=fashion' }, slug: 'fashion' },
      { title: 'Best sellers in Books', seeMore: { label: 'Shop Books', path: '/s?dept=books' }, slug: 'books' },
      { title: "Toys they'll love", seeMore: { label: 'Shop Toys & Games', path: '/s?dept=toys' }, slug: 'toys' },
    ],
    rails: [
      { title: "Today's Deals", slug: '', path: '/deals' },
      { title: 'Best Sellers in Electronics', slug: 'electronics', path: '/s?dept=electronics' },
      { title: 'Top picks in Home & Kitchen', slug: 'home-kitchen', path: '/s?dept=home-kitchen' },
    ],
    showPay: false,
  };
}

export default async function Home() {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const { slides, cards, rails, showPay } = homeContent(store);
  const promos = store.id === 'IN' ? promoTiles(store) : [];
  // US pulls the card grid up onto the hero fade; IN's promo row separates them, so no pull.
  const cardGridMt = promos.length ? 'mt-5' : '-mt-[56px] sm:-mt-[72px]';

  return (
    <AppShell>
      <div className="bg-surface-band pb-10">
        <HeroCarousel slides={slides} />

        {/* amazon.in lead promo tiles */}
        {promos.length ? (
          <div className="mx-auto mt-5 max-w-[1500px] px-4">
            <PromoRow tiles={promos} />
          </div>
        ) : null}

        {/* card grid — pulled onto the hero fade on US; below the promo row on IN */}
        <div className={`relative z-[1] mx-auto ${cardGridMt} max-w-[1500px] px-4`}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <CategoryCard key={c.title} title={c.title} seeMore={{ label: c.seeMore.label, href: sp(c.seeMore.path) }} items={items(c.slug, store)} />
            ))}
          </div>
        </div>

        {/* Amazon Pay / UPI strip — an amazon.in home module with no amazon.com equivalent */}
        {showPay ? (
          <div className="mx-auto mt-5 max-w-[1500px] px-4">
            <PayStrip href={sp('/amazon-pay')} />
          </div>
        ) : null}

        {/* rails */}
        <div className="mx-auto mt-5 max-w-[1500px] space-y-5 px-4">
          {rails.map((r) => (
            <ProductRail
              key={r.title}
              title={r.title}
              seeMoreHref={sp(r.path)}
              products={r.slug ? productsIn(r.slug, store.id) : deals(store.id).slice(0, 14)}
              store={store}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

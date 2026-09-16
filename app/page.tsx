import { AppShell } from '@/components/AppShell';
import { HeroCarousel, type HeroSlide } from '@/components/home/HeroCarousel';
import { CategoryCard, type CategoryCardItem } from '@/components/home/CategoryCard';
import { ProductRail } from '@/components/home/ProductRail';
import { productsIn, deals, type Product } from '@/lib/catalog';

/** short label for a card thumbnail: brand if present, else first two words of the title */
function shortLabel(p: Product): string {
  if (p.brand) return p.brand;
  return p.title.split(/[\s,]+/).slice(0, 2).join(' ');
}
function items(slug: string, n = 4): CategoryCardItem[] {
  return productsIn(slug).slice(0, n).map((p) => ({ image: p.image, label: shortLabel(p), href: `/product/${p.id}` }));
}
function heroImages(slug: string, n = 4): string[] {
  return productsIn(slug).slice(0, n).map((p) => p.image);
}

const SLIDES: HeroSlide[] = [
  {
    eyebrow: 'Deals of the day',
    title: 'Save big on top electronics',
    cta: 'Shop deals',
    href: '/s?dept=electronics',
    bg: 'bg-gradient-to-r from-[#0f1111] via-[#232f3e] to-[#4a5b6d]',
    images: heroImages('electronics'),
  },
  {
    eyebrow: 'Home refresh',
    title: 'Kitchen & cookware picks',
    cta: 'Shop home',
    href: '/s?dept=home-kitchen',
    bg: 'bg-gradient-to-r from-[#8a5a2b] via-[#c08838] to-[#f0c27b]',
    images: heroImages('home-kitchen'),
  },
  {
    eyebrow: 'Glow up',
    title: 'Beauty must-haves under $50',
    cta: 'Shop beauty',
    href: '/s?dept=beauty',
    bg: 'bg-gradient-to-r from-[#a83279] via-[#d16ba5] to-[#f6c6e0]',
    images: heroImages('beauty'),
  },
  {
    eyebrow: 'New & trending',
    title: 'Toys & games for every age',
    cta: 'Shop toys',
    href: '/s?dept=toys',
    bg: 'bg-gradient-to-r from-[#1d6f6f] via-[#2aa198] to-[#7fd8cf]',
    images: heroImages('toys'),
  },
];

export default function Home() {
  return (
    <AppShell>
      <div className="bg-surface-band pb-10">
        <HeroCarousel slides={SLIDES} />

        {/* card grid pulled up over the hero's bottom fade */}
        <div className="relative z-[1] mx-auto -mt-[140px] max-w-[1500px] px-4 sm:-mt-[180px]">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <CategoryCard title="Deals in Electronics" seeMore={{ label: 'See all deals', href: '/s?dept=electronics' }} items={items('electronics')} />
            <CategoryCard title="Get fit at home" seeMore={{ label: 'Shop Sports & Outdoors', href: '/s?dept=sports' }} items={items('sports')} />
            <CategoryCard title="Beauty picks for you" seeMore={{ label: 'Shop Beauty', href: '/s?dept=beauty' }} items={items('beauty')} />
            <CategoryCard title="Level up your setup" variant="single" seeMore={{ label: 'Shop Computers', href: '/s?dept=computers' }} items={items('computers', 1)} />

            <CategoryCard title="Kitchen essentials" seeMore={{ label: 'Shop Home & Kitchen', href: '/s?dept=home-kitchen' }} items={items('home-kitchen')} />
            <CategoryCard title="Shoes for every run" seeMore={{ label: 'Shop Fashion', href: '/s?dept=fashion' }} items={items('fashion')} />
            <CategoryCard title="Best sellers in Books" seeMore={{ label: 'Shop Books', href: '/s?dept=books' }} items={items('books')} />
            <CategoryCard title="Toys they'll love" seeMore={{ label: 'Shop Toys & Games', href: '/s?dept=toys' }} items={items('toys')} />
          </div>
        </div>

        {/* rails */}
        <div className="mx-auto mt-5 max-w-[1500px] space-y-5 px-4">
          <ProductRail title="Today's Deals" seeMoreHref="/deals" products={deals().slice(0, 14)} />
          <ProductRail title="Best Sellers in Electronics" seeMoreHref="/s?dept=electronics" products={productsIn('electronics')} />
          <ProductRail title="Top picks in Home & Kitchen" seeMoreHref="/s?dept=home-kitchen" products={productsIn('home-kitchen')} />
        </div>
      </div>
    </AppShell>
  );
}

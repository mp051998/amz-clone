import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Breadcrumbs } from '@/components/commerce/Breadcrumbs';
import { Stars } from '@/components/primitives/Stars';
import { Price } from '@/components/primitives/Price';
import { Badge } from '@/components/primitives/Badge';
import { BuyPanel } from '@/components/product/BuyPanel';
import { ProductRail } from '@/components/home/ProductRail';
import { getProduct, productsIn, categoryName } from '@/lib/catalog';
import { deliveryDate } from '@/lib/dates';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = getProduct(id);
  return { title: p ? `${p.title} : Amazon.com` : 'Product : Amazon.com' };
}

function badgeFor(badge?: string) {
  if (badge === "Amazon's Choice") return <Badge tone="choice">Amazon&apos;s Choice</Badge>;
  if (badge === 'Best Seller') return <span className="rounded-[4px] bg-[#C45500] px-1.5 py-0.5 text-[12px] text-white">#1 Best Seller</span>;
  if (badge === 'Overall Pick') return <Badge tone="pick">Overall Pick</Badge>;
  return null;
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProduct(id);
  if (!p) notFound();

  const savingsMinor = p.listMinor && p.listMinor > p.priceMinor ? p.listMinor - p.priceMinor : 0;
  const similar = productsIn(p.category).filter((x) => x.id !== p.id);
  const trail = [
    { label: 'Home', href: '/' },
    { label: categoryName(p.category), href: `/s?dept=${p.category}` },
    { label: p.title.length > 60 ? p.title.slice(0, 60) + '…' : p.title },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-[1500px] px-4 pt-2">
        <Breadcrumbs trail={trail} />

        <div className="mt-2 flex flex-col gap-6 lg:flex-row">
          {/* Gallery */}
          <div className="flex gap-3 lg:w-[42%]">
            <div className="hidden flex-col gap-2 sm:flex">
              <span className="flex h-12 w-12 items-center justify-center rounded-[6px] border-2 border-link-teal bg-white p-1">
                <img src={p.image} alt="" className="max-h-full max-w-full object-contain" />
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <img src={p.image} alt={p.title} className="max-h-[460px] w-full object-contain" />
            </div>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-medium leading-8 text-ink">{p.title}</h1>
            {p.brand ? (
              <a href={`/s?brand=${encodeURIComponent(p.brand)}`} className="mt-1 inline-block text-[14px] text-link hover:text-link-hover hover:underline">
                Visit the {p.brand} Store
              </a>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Stars rating={p.rating} count={p.reviewCount} href="#reviews" size={18} />
              {badgeFor(p.badge)}
            </div>
            {p.boughtPastMonth ? <p className="mt-1 text-[13px] text-ink-2">{p.boughtPastMonth}</p> : null}

            <hr className="my-3 border-line-3" />

            <div className="flex items-baseline gap-2">
              {p.deal && p.dealPct ? <span className="text-[26px] text-price-deal">-{p.dealPct}%</span> : null}
              <Price minor={p.priceMinor} currency="USD" size={30} />
            </div>
            {p.listMinor ? (
              <p className="mt-1 text-[13px] text-ink-2">
                List Price: <s>{`$${(p.listMinor / 100).toFixed(2)}`}</s>
                {savingsMinor ? <span className="ml-2">You Save: <b className="text-price-deal">{`$${(savingsMinor / 100).toFixed(2)}`}</b></span> : null}
              </p>
            ) : null}

            <hr className="my-3 border-line-3" />

            <h2 className="text-[18px] font-bold text-ink">About this item</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] leading-5 text-ink">
              {p.bullets.map((b, i) => (<li key={i}>{b}</li>))}
            </ul>

            <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-1 text-[13px]">
              <dt className="text-ink-2">Brand</dt><dd>{p.brand ?? 'Generic'}</dd>
              <dt className="text-ink-2">Category</dt><dd>{categoryName(p.category)}</dd>
              <dt className="text-ink-2">Seller</dt><dd>{p.seller}</dd>
              <dt className="text-ink-2">Ships from</dt><dd>{p.shipsFrom}</dd>
            </dl>
          </div>

          {/* Buy box */}
          <div className="lg:w-[260px] lg:shrink-0">
            <BuyPanel product={p} promise={deliveryDate(3)} fastest={deliveryDate(1)} />
          </div>
        </div>

        {similar.length > 0 ? (
          <div className="mt-8">
            <ProductRail title="Products related to this item" seeMoreHref={`/s?dept=${p.category}`} products={similar} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

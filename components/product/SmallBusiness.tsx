import type { SmallBusiness } from '@/lib/data/small-businesses';
import { cn } from '../lib/cn';
import { IconShop } from '../icons';

/** "Small Business", with its shopfront: on a search result, under a product's title (a link to the brand's story there) and on its brand store. */
export function SmallBusinessBadge({ href, className }: { href?: string; className?: string }) {
  const body = (
    <>
      <IconShop width={16} height={16} />
      <span>Small Business</span>
    </>
  );
  const cls = cn('inline-flex items-center gap-1 self-start text-[13px] font-semibold text-ink', className);
  return href ? (
    <a href={href} className={cn(cls, 'no-underline hover:underline')}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** A small business's product: the brand, what it makes, and a way to its store. */
export function SmallBusinessPanel({ business, storeHref }: { business: SmallBusiness; storeHref: string }) {
  return (
    <section id="small-business" aria-labelledby="small-business-h" className="flex max-w-[860px] flex-col gap-3">
      <h2 id="small-business-h" className="m-0 text-[22px] font-semibold">From a small business</h2>
      <div className="flex flex-col gap-2 rounded-input border border-line p-3">
        <SmallBusinessBadge />
        <p className="m-0 text-[15px] leading-snug">
          This product is from <b className="font-semibold">{business.brand}</b>, a small business brand. {business.story}
        </p>
        <a href={storeHref} className="self-start text-[14px] text-ink-2 underline underline-offset-2 hover:text-ink">Visit the {business.brand} Store</a>
      </div>
      <p className="m-0 text-[12px] text-ink-3">Small Business is this store&apos;s own designation, for demonstration.</p>
    </section>
  );
}

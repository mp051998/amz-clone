export interface CategoryCardItem {
  image: string;
  label: string;
  href: string;
}

export interface CategoryCardProps {
  title: string;
  seeMore: { label: string; href: string };
  /** quad = 2×2 labeled grid; single = one large image */
  variant?: 'quad' | 'single';
  items: readonly CategoryCardItem[];
}

/** White home card over the grey band: heading, image(s), teal see-more (design.md §5 Home cards). */
export function CategoryCard({ title, seeMore, variant = 'quad', items }: CategoryCardProps) {
  const single = variant === 'single';
  return (
    <section className="flex h-full flex-col bg-white p-5 shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
      <h2 className="mb-3 text-[21px] font-bold leading-6 text-ink">{title}</h2>
      {single ? (
        <a href={items[0]?.href ?? seeMore.href} className="group block flex-1">
          <div className="flex h-[240px] items-center justify-center overflow-hidden bg-white">
            <img src={items[0]?.image} alt={items[0]?.label ?? title} className="h-full w-full object-contain transition group-hover:scale-[1.03]" loading="lazy" />
          </div>
        </a>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2">
          {items.slice(0, 4).map((it) => (
            <a key={it.href} href={it.href} className="group block">
              <div className="flex h-[86px] items-center justify-center overflow-hidden bg-white">
                <img src={it.image} alt={it.label} className="h-full w-full object-contain transition group-hover:scale-[1.04]" loading="lazy" />
              </div>
              <p className="mt-1 line-clamp-1 text-[12px] text-ink">{it.label}</p>
            </a>
          ))}
        </div>
      )}
      <a href={seeMore.href} className="mt-3 text-[13px] text-link-teal hover:text-brand-count hover:underline">{seeMore.label}</a>
    </section>
  );
}

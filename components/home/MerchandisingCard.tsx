export interface MerchandisingCardItem {
  image: string;
  alt: string;
  href: string;
  label?: string;
}

export interface MerchandisingCardData {
  id: string;
  title: string;
  cta: string;
  href: string;
  items: readonly MerchandisingCardItem[];
}

/** Editorial home card that supports both four-up category picks and single hero items. */
export function MerchandisingCard({ card }: { card: MerchandisingCardData }) {
  const singleItem = card.items.length === 1;

  return (
    <section aria-labelledby={`${card.id}-title`} className="flex h-full flex-col bg-white p-5 shadow-[0_1px_2px_rgba(15,17,17,0.15)]">
      <h2 id={`${card.id}-title`} className="mb-3 text-[21px] font-bold leading-6 text-ink">{card.title}</h2>
      <div className={singleItem ? 'flex flex-1' : 'grid flex-1 grid-cols-2 gap-x-3 gap-y-2'}>
        {card.items.map((item) => (
          <a key={item.href} href={item.href} className={singleItem ? 'group block flex-1' : 'group block'}>
            <div className={`flex items-center justify-center overflow-hidden bg-white ${singleItem ? 'h-[240px]' : 'h-[86px]'}`}>
              <img src={item.image} alt={item.alt} className="h-full w-full object-contain transition group-hover:scale-[1.04]" loading="lazy" />
            </div>
            {item.label ? <p className="mt-1 line-clamp-1 text-[12px] text-ink">{item.label}</p> : null}
          </a>
        ))}
      </div>
      <a href={card.href} className="mt-3 text-[13px] text-link-teal hover:text-brand-count hover:underline">{card.cta}</a>
    </section>
  );
}

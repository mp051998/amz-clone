/** A tall promotional tile as seen on the amazon.in home — a headline price point,
 *  a subject, optional "top brands / latest trends" tags, then either a single hero
 *  image, a 2×2 deals grid, or a dark "Amazon Music" style panel, capped by the
 *  Amazon Pay ICICI cashback strip. Modular: the page composes the data (images,
 *  formatted prices) and this component only renders it. */
export interface PromoDeal { image: string; price: string; list?: string }
export interface PromoTile {
  headline: string;
  sub: string;
  tags?: string[];
  image?: string;
  deals?: PromoDeal[];
  music?: boolean;
  cashback?: boolean;
  href: string;
}

function Cashback() {
  return (
    <div className="mt-auto flex items-center gap-2 border-t border-line bg-[#f3f3f3] px-3 py-2">
      <span className="flex h-5 w-8 items-center justify-center rounded-[2px] bg-gradient-to-br from-[#232f3e] to-[#37475a] text-[7px] font-bold text-white">ICICI</span>
      <span className="text-[10px] leading-[12px] text-ink-2">Unlimited 5% cashback* with Amazon Pay ICICI Bank credit card</span>
    </div>
  );
}

export function PromoCard({ tile }: { tile: PromoTile }) {
  if (tile.music) {
    return (
      <a href={tile.href} className="flex w-[230px] shrink-0 flex-col overflow-hidden rounded-[4px] bg-[#0a0a0a] text-white shadow-[0_1px_3px_rgba(15,17,17,0.2)] sm:w-[250px]">
        <div className="relative flex flex-1 flex-col p-4">
          <h3 className="text-[24px] font-extrabold leading-tight">{tile.headline}</h3>
          <p className="mt-1 text-[14px] text-white/80">{tile.sub}</p>
          <div className="mt-auto flex items-center gap-1 pt-6">
            <span className="text-[17px] font-bold">amazon</span>
            <span className="text-[13px] font-medium text-[#45c8f1]">music</span>
          </div>
          {/* diagonal accent, echoing the real Amazon Music tile */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[repeating-linear-gradient(115deg,#0a0a0a_0_14px,#12a3c9_14px_20px)] opacity-70" />
        </div>
      </a>
    );
  }
  return (
    <a href={tile.href} className="flex w-[230px] shrink-0 flex-col overflow-hidden rounded-[4px] bg-white shadow-[0_1px_3px_rgba(15,17,17,0.2)] sm:w-[250px]">
      <div className="flex flex-1 flex-col px-4 pt-4">
        <h3 className="text-[22px] font-extrabold leading-tight text-ink">{tile.headline}</h3>
        <p className="mt-0.5 text-[15px] text-ink">{tile.sub}</p>
        {tile.tags?.length ? (
          <div className="mt-1 flex gap-3 text-[12px] text-ink-2">
            {tile.tags.map((t, i) => (
              <span key={t} className={i > 0 ? 'border-l border-line pl-3' : ''}>{t}</span>
            ))}
          </div>
        ) : null}

        {tile.deals?.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2 pb-4">
            {tile.deals.slice(0, 4).map((d, k) => (
              <div key={k} className="flex flex-col">
                <div className="flex h-[92px] items-center justify-center overflow-hidden rounded-[3px] bg-white">
                  <img src={d.image} alt="" className="h-full w-full object-contain" loading="lazy" />
                </div>
                <span className="mt-0.5 text-[13px] font-bold text-price">{d.price}</span>
                {d.list ? <span className="text-[11px] text-ink-3 line-through">{d.list}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex flex-1 items-center justify-center overflow-hidden pb-4">
            <img src={tile.image} alt="" className="max-h-[220px] w-full object-contain" loading="lazy" />
          </div>
        )}
      </div>
      {tile.cashback ? <Cashback /> : null}
    </a>
  );
}

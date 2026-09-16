import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { getMarketplace } from '@/lib/marketplace-server';
import { primeVideoContent, type PVTitle } from '@/lib/prime-video';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `Prime Video : Amazon.${store.hostname.split('.').pop()}` };
}

/** deterministic 2-tone poster art from a hue (no external images). */
function posterStyle(hue: number): React.CSSProperties {
  return { background: `linear-gradient(155deg, hsl(${hue} 58% 34%), hsl(${(hue + 34) % 360} 62% 15%))` };
}

function Poster({ t }: { t: PVTitle }) {
  return (
    <a href="#" className="group w-[150px] shrink-0 sm:w-[160px]">
      <div className="relative aspect-[2/3] overflow-hidden rounded-[6px] ring-1 ring-white/10 transition group-hover:ring-2 group-hover:ring-[#1399FF]" style={posterStyle(t.hue)}>
        {t.tag ? (
          <span className="absolute left-0 top-2 rounded-r-[3px] bg-[#1399FF] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t.tag}</span>
        ) : null}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-2.5">
          <p className="text-[15px] font-bold leading-tight text-white drop-shadow">{t.title}</p>
          <p className="mt-0.5 text-[10px] text-white/70">{t.meta}</p>
          {t.imdb ? (
            <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-[2px] bg-[#f5c518] px-1 py-px text-[9px] font-bold text-black">IMDb {t.imdb.toFixed(1)}</span>
          ) : null}
        </div>
      </div>
    </a>
  );
}

export default async function PrimeVideoPage() {
  const store = await getMarketplace();
  const content = primeVideoContent(store.id);
  const { hero, rails } = content;

  return (
    <AppShell>
      <div className="bg-[#0f171e] text-white">
        <div className="mx-auto max-w-[1500px] px-4 py-4">
          {/* Prime Video wordmark row */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[22px] font-bold tracking-tight">prime video</span>
            <span className="rounded-[3px] bg-[#1399FF] px-1.5 py-0.5 text-[11px] font-bold">amazon</span>
          </div>

          {/* Hero */}
          <section className="relative overflow-hidden rounded-[10px] ring-1 ring-white/10" style={posterStyle(hero.hue)}>
            <div className="flex min-h-[300px] flex-col justify-end bg-gradient-to-t from-black/80 via-black/30 to-transparent p-6 sm:min-h-[380px] sm:p-10">
              <span className="mb-2 w-fit rounded-[3px] bg-[#1399FF] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">{hero.tag}</span>
              <h1 className="max-w-[620px] text-[34px] font-extrabold leading-none sm:text-[52px]">{hero.title}</h1>
              <p className="mt-1 text-[12px] font-medium text-white/70">{hero.meta}</p>
              <p className="mt-3 max-w-[560px] text-[13px] leading-5 text-white/85 sm:text-[15px]">{hero.blurb}</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <a href="#" className="flex h-[38px] items-center gap-2 rounded-[4px] bg-white px-5 text-[14px] font-bold text-black hover:bg-white/90">
                  <span className="text-[16px] leading-none">▶</span> Play
                </a>
                <a href="#" className="flex h-[38px] items-center gap-2 rounded-[4px] bg-white/15 px-5 text-[14px] font-bold text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/25">
                  + Watchlist
                </a>
              </div>
            </div>
          </section>

          {/* Rails */}
          <div className="space-y-7 py-7">
            {rails.map((rail) => (
              <section key={rail.heading}>
                <h2 className="mb-3 text-[19px] font-bold">{rail.heading}</h2>
                <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20">
                  {rail.titles.map((t) => (<Poster key={t.title} t={t} />))}
                </div>
              </section>
            ))}
          </div>

          <p className="border-t border-white/10 py-6 text-center text-[12px] text-white/40">
            Titles shown for this demo reflect {store.id === 'IN' ? 'Prime Video India' : 'Prime Video US'} programming. Unofficial clone — not affiliated with Amazon or Prime Video.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

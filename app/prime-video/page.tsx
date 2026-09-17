import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { getMarketplace } from '@/lib/marketplace-server';
import { primeVideoContent, backdropFor, type PVTitle } from '@/lib/prime-video';
import { PosterImage } from '@/components/prime/PosterImage';
import { NonPrimeLanding } from '@/components/prime/NonPrimeLanding';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `Prime Video : Amazon.${store.hostname.split('.').pop()}` };
}

/** deterministic 2-tone art from a hue — the fallback behind any missing image. */
function posterStyle(hue: number): React.CSSProperties {
  return { background: `linear-gradient(155deg, hsl(${hue} 58% 34%), hsl(${(hue + 34) % 360} 62% 15%))` };
}

/** portrait poster tile with a hover detail overlay (title, rating, synopsis). */
function Poster({ t }: { t: PVTitle }) {
  return (
    <a href="#" className="group w-[150px] shrink-0 sm:w-[160px]">
      <div className="relative aspect-[2/3] overflow-hidden rounded-[6px] ring-1 ring-white/10 transition group-hover:ring-2 group-hover:ring-[#1399FF]" style={posterStyle(t.hue)}>
        {t.poster ? <PosterImage src={t.poster} alt={t.title} /> : null}
        {t.tag ? (
          <span className="absolute left-0 top-2 z-10 rounded-r-[3px] bg-[#1399FF] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t.tag}</span>
        ) : null}
        {/* resting state: IMDb badge (poster present) or the title text (gradient only) */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-2.5 transition group-hover:opacity-0">
          {t.poster ? (
            t.imdb ? (
              <span className="mt-auto inline-flex w-fit items-center gap-1 rounded-[2px] bg-[#f5c518] px-1 py-px text-[9px] font-bold text-black">IMDb {t.imdb.toFixed(1)}</span>
            ) : null
          ) : (
            <>
              <p className="text-[15px] font-bold leading-tight text-white drop-shadow">{t.title}</p>
              <p className="mt-0.5 text-[10px] text-white/70">{t.meta}</p>
            </>
          )}
        </div>
        {/* hover state: full detail */}
        <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/95 via-black/70 to-black/30 p-2.5 opacity-0 transition group-hover:opacity-100">
          <p className="text-[13px] font-bold leading-tight text-white">{t.title}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-white/70">
            {t.imdb ? <span className="inline-flex items-center rounded-[2px] bg-[#f5c518] px-1 py-px font-bold text-black">IMDb {t.imdb.toFixed(1)}</span> : null}
            <span>{t.meta}</span>
          </div>
          {t.desc ? <p className="line-clamp-4 text-[10px] leading-[13px] text-white/80">{t.desc}</p> : null}
          <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-[3px] bg-white px-2 py-0.5 text-[10px] font-bold text-black">▶ Play</span>
        </div>
      </div>
    </a>
  );
}

/** wide landscape spotlight card — the "bigger preview" with backdrop + synopsis. */
function Spotlight({ t }: { t: PVTitle }) {
  const backdrop = backdropFor(t.poster);
  return (
    <a href="#" className="group relative block aspect-video overflow-hidden rounded-[10px] ring-1 ring-white/10 transition hover:ring-2 hover:ring-[#1399FF]" style={posterStyle(t.hue)}>
      {backdrop ? <PosterImage src={backdrop} alt="" /> : null}
      {t.tag ? (
        <span className="absolute left-0 top-3 z-10 rounded-r-[3px] bg-[#1399FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{t.tag}</span>
      ) : null}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4">
        <p className="text-[18px] font-extrabold leading-tight text-white drop-shadow sm:text-[20px]">{t.title}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/75">
          {t.imdb ? <span className="inline-flex items-center rounded-[2px] bg-[#f5c518] px-1 py-px font-bold text-black">IMDb {t.imdb.toFixed(1)}</span> : null}
          <span>{t.meta}</span>
        </div>
        {t.desc ? <p className="mt-1.5 line-clamp-2 max-w-[92%] text-[12px] leading-4 text-white/85">{t.desc}</p> : null}
        <div className="mt-3 flex gap-2">
          <span className="inline-flex items-center gap-1 rounded-[4px] bg-white px-4 py-1.5 text-[12px] font-bold text-black">▶ Play</span>
          <span className="inline-flex items-center gap-1 rounded-[4px] bg-white/15 px-3 py-1.5 text-[12px] font-bold text-white ring-1 ring-white/30 backdrop-blur">+ Watchlist</span>
        </div>
      </div>
    </a>
  );
}

export default async function PrimeVideoPage() {
  const store = await getMarketplace();
  const content = primeVideoContent(store.id);
  const { hero, rails } = content;
  const heroBackdrop = backdropFor(hero.poster);
  const featured = rails[0]?.titles.slice(0, 3) ?? [];

  // amazon.in shows the non-subscriber landing (mirrors primevideo.com's
  // nonprimehomepage): promo panels selling the membership, not browse rails.
  if (store.id === 'IN') {
    const sp = (p: string) => storePath(store, p);
    const heroImages = [hero.poster, ...rails.flatMap((r) => r.titles.map((t) => t.poster))]
      .map((p) => backdropFor(p))
      .filter((x): x is string => Boolean(x));
    const rentImages = [...(rails[1]?.titles ?? []), ...(rails[2]?.titles ?? [])]
      .map((t) => t.poster)
      .filter((x): x is string => Boolean(x));
    const channels = ['Apple TV+', 'Lionsgate Play', 'MUBI', 'Anime Times', 'ManoramaMAX', 'Chaupal', 'BBC Player', 'Sun NXT', 'MovieSphere+'];
    return (
      <AppShell>
        <div className="bg-[#0f171e] text-white">
          <div className="mx-auto max-w-[1500px] px-4 py-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[22px] font-bold tracking-tight">prime video</span>
              <span className="rounded-[3px] bg-[#1399FF] px-1.5 py-0.5 text-[11px] font-bold">amazon</span>
            </div>
            <NonPrimeLanding signInHref={sp('/signin')} rentHref={sp('/signin')} heroImages={heroImages} rentImages={rentImages} channels={channels} />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="bg-[#0f171e] text-white">
        <div className="mx-auto max-w-[1500px] px-4 py-4">
          {/* Prime Video wordmark row */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[22px] font-bold tracking-tight">prime video</span>
            <span className="rounded-[3px] bg-[#1399FF] px-1.5 py-0.5 text-[11px] font-bold">amazon</span>
          </div>

          {/* Hero — wide backdrop with cinematic scrim */}
          <section className="relative overflow-hidden rounded-[10px] ring-1 ring-white/10" style={posterStyle(hero.hue)}>
            {heroBackdrop ? (
              <PosterImage src={heroBackdrop} alt="" priority />
            ) : hero.poster ? (
              <img src={hero.poster} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[50%_18%]" />
            ) : null}
            <div className="relative flex min-h-[320px] flex-col justify-end bg-gradient-to-t from-black/90 via-black/45 to-black/10 p-6 sm:min-h-[440px] sm:p-10">
              <span className="mb-2 w-fit rounded-[3px] bg-[#1399FF] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">{hero.tag}</span>
              <h1 className="max-w-[620px] text-[34px] font-extrabold leading-none sm:text-[54px]">{hero.title}</h1>
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

          {/* Featured spotlight — bigger previews with synopsis */}
          {featured.length ? (
            <section className="pt-7">
              <h2 className="mb-3 text-[19px] font-bold">Featured on Prime</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((t) => (<Spotlight key={t.title} t={t} />))}
              </div>
            </section>
          ) : null}

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
            Titles shown for this demo reflect Prime Video US programming. Unofficial clone — not affiliated with Amazon or Prime Video.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

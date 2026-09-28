import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, DemoNote, PlusBadge } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { buttonClasses } from '@/components/primitives/Button';
import { getMarketplace } from '@/lib/marketplace-server';
import { primeVideoContent, backdropFor, type PVTitle } from '@/lib/prime-video';
import { PosterImage } from '@/components/prime/PosterImage';
import { NonPrimeLanding } from '@/components/prime/NonPrimeLanding';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: 'Plus Video · Store' };

/** Mono meta line: "IMDb 8.7 · 2024 · Action · 16+". */
function Meta({ t }: { t: Pick<PVTitle, 'imdb' | 'meta'> }) {
  return (
    <span className="font-mono text-[12px] text-ink-3">
      {t.imdb ? <>IMDb {t.imdb.toFixed(1)} · </> : null}{t.meta}
    </span>
  );
}

/** Portrait poster card: hatched frame + art, then title and meta underneath (no hover-only info). */
function Poster({ t, href }: { t: PVTitle; href: string }) {
  return (
    <a href={href} className="group flex w-[148px] flex-none flex-col gap-2 text-ink no-underline sm:w-[160px]">
      <div className="hatch relative aspect-[2/3] overflow-hidden rounded-image border border-line transition-colors group-hover:border-ink">
        {t.poster ? <PosterImage src={t.poster} alt="" /> : (
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-ink-4">poster</span>
        )}
      </div>
      <span className="line-clamp-2 text-[14px] font-semibold leading-tight group-hover:text-accent-ink">{t.title}</span>
      <Meta t={t} />
    </a>
  );
}

/** Landscape spotlight card with synopsis. */
function Spotlight({ t, href }: { t: PVTitle; href: string }) {
  const backdrop = backdropFor(t.poster);
  return (
    <a href={href} className="group flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 text-ink no-underline transition-colors hover:border-ink">
      <div className="hatch relative aspect-video overflow-hidden rounded-image">
        {backdrop ? <PosterImage src={backdrop} alt="" /> : null}
      </div>
      <div className="flex flex-col gap-1">
        {t.tag ? <Kicker>{t.tag}</Kicker> : null}
        <span className="text-[17px] font-semibold leading-tight">{t.title}</span>
        <Meta t={t} />
        {t.desc ? <p className="m-0 mt-1 line-clamp-2 text-[14px] leading-snug text-ink-2">{t.desc}</p> : null}
      </div>
    </a>
  );
}

export default async function PlusVideoPage() {
  const store = await getMarketplace();
  const sp = (p: string) => storePath(store, p);
  const content = primeVideoContent(store.id);
  const { hero, rails } = content;
  const heroBackdrop = backdropFor(hero.poster);
  const featured = rails[0]?.titles.slice(0, 3) ?? [];
  const watchHref = sp('/signin');

  const head = (
    <PageHead kicker={<span className="inline-flex items-center gap-2"><PlusBadge /> Video</span>} title="Plus Video">
      Movies and series included with a Plus membership. Titles are illustrative for this demo store.
    </PageHead>
  );

  // IN shows the non-member landing (join, rentals, channels) rather than browse rails.
  if (store.id === 'IN') {
    const heroImages = [hero.poster, ...rails.flatMap((r) => r.titles.map((t) => t.poster))]
      .map((p) => backdropFor(p))
      .filter((x): x is string => Boolean(x));
    const rentImages = [...(rails[1]?.titles ?? []), ...(rails[2]?.titles ?? [])]
      .map((t) => t.poster)
      .filter((x): x is string => Boolean(x));
    const channels = ['Apple TV+', 'Lionsgate Play', 'MUBI', 'Anime Times', 'ManoramaMAX', 'Chaupal', 'BBC Player', 'Sun NXT', 'MovieSphere+'];
    return (
      <AppShell>
        <Page>
          {head}
          <NonPrimeLanding signInHref={sp('/signin')} rentHref={sp('/signin')} heroImages={heroImages} rentImages={rentImages} channels={channels} />
          <DemoNote>Demo page in an unofficial portfolio store — titles are shown for illustration, nothing streams, and no channel is sold.</DemoNote>
        </Page>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Page>
        {head}

        <section className="grid overflow-hidden rounded-panel border border-line bg-surface lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="hatch relative aspect-video lg:aspect-auto lg:min-h-[360px]">
            {heroBackdrop ? <PosterImage src={heroBackdrop} alt="" priority /> : null}
          </div>
          <div className="flex flex-col justify-center gap-3 p-5 sm:p-7">
            <Kicker>{hero.tag}</Kicker>
            <h2 className="m-0 text-[clamp(24px,3vw,32px)] font-semibold leading-tight tracking-[-0.01em] text-ink">{hero.title}</h2>
            <span className="font-mono text-[12px] text-ink-3">{hero.meta}</span>
            <p className="m-0 text-[15px] leading-relaxed text-ink-2">{hero.blurb}</p>
            <div className="mt-1 flex flex-wrap gap-2.5">
              <a href={watchHref} className={buttonClasses({ variant: 'dark' })}><span aria-hidden>▶</span> Play</a>
              <a href={watchHref} className={buttonClasses({ variant: 'secondary' })}>+ Watchlist</a>
            </div>
          </div>
        </section>

        {featured.length ? (
          <Section title="Featured">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3.5">
              {featured.map((t) => (<Spotlight key={t.title} t={t} href={watchHref} />))}
            </div>
          </Section>
        ) : null}

        {rails.map((rail) => (
          <Section key={rail.heading} title={rail.heading}>
            <div className="no-scrollbar -mx-[clamp(16px,3vw,24px)] flex gap-3.5 overflow-x-auto px-[clamp(16px,3vw,24px)] pb-1">
              {rail.titles.map((t) => (<Poster key={t.title} t={t} href={watchHref} />))}
            </div>
          </Section>
        ))}

        <DemoNote>Demo page in an unofficial portfolio store — titles are shown for illustration and nothing streams.</DemoNote>
      </Page>
    </AppShell>
  );
}

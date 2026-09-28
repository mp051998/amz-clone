import type { ReactNode } from 'react';
import { buttonClasses } from '../primitives/Button';
import { Kicker } from '../decision/Badges';
import { PosterImage } from './PosterImage';

/**
 * Plus Video landing for non-members (IN store): three calm panels selling the membership — join,
 * rentals, add-on channels — instead of browse rails. Artwork sits on the hatched frame so a missing
 * image degrades to the placeholder (design.md §5 ProductFrame). Purely presentational.
 */
export interface NonPrimeLandingProps {
  signInHref: string;
  rentHref: string;
  /** landscape 16:9 backdrops for the join mosaic. */
  heroImages: string[];
  /** portrait posters for the rentals row. */
  rentImages: string[];
  /** add-on channel names. */
  channels: string[];
}

function Panel({ kicker, heading, sub, cta, children }: { kicker: string; heading: string; sub: string; cta: ReactNode; children: ReactNode }) {
  return (
    <section className="grid items-center gap-6 rounded-panel border border-line bg-surface p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10">
      <div className="flex max-w-[460px] flex-col gap-3">
        <Kicker>{kicker}</Kicker>
        <h2 className="m-0 text-[clamp(22px,2.6vw,28px)] font-semibold leading-tight tracking-[-0.01em] text-ink">{heading}</h2>
        <p className="m-0 text-[15px] leading-relaxed text-ink-2">{sub}</p>
        <div className="mt-1">{cta}</div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Frame({ src, ratio }: { src: string; ratio: string }) {
  return (
    <div className="hatch relative overflow-hidden rounded-image" style={{ aspectRatio: ratio }}>
      <PosterImage src={src} alt="" />
    </div>
  );
}

export function NonPrimeLanding({ signInHref, rentHref, heroImages, rentImages, channels }: NonPrimeLandingProps) {
  return (
    <div className="flex flex-col gap-4">
      <Panel
        kicker="Included with Plus"
        heading="Movies, series and originals, included"
        sub="Join Plus to watch the latest movies, series and original shows at no extra cost."
        cta={<a href={signInHref} className={buttonClasses({ variant: 'primary' })}>Sign in to join Plus</a>}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {heroImages.slice(0, 6).map((src) => (<Frame key={src} src={src} ratio="16/9" />))}
        </div>
      </Panel>

      <Panel
        kicker="No membership needed"
        heading="Rent new movies"
        sub="Early access to new movies before they reach the subscription. Rent the latest releases, pay per title."
        cta={<a href={rentHref} className={buttonClasses({ variant: 'secondary' })}>Rent a movie</a>}
      >
        <div className="grid grid-cols-5 gap-2">
          {rentImages.slice(0, 5).map((src) => (<Frame key={src} src={src} ratio="2/3" />))}
        </div>
      </Panel>

      <Panel
        kicker="Add-on channels"
        heading="Your other subscriptions, in one place"
        sub="Add premium and specialty channels and watch them in the same app — billed separately, cancel anytime."
        cta={<a href={signInHref} className={buttonClasses({ variant: 'secondary' })}>Explore channels</a>}
      >
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3">
          {channels.slice(0, 9).map((name) => (
            <li key={name} className="flex min-h-[64px] items-center justify-center rounded-card border border-line bg-surface-3 px-2 text-center text-[14px] font-semibold leading-tight text-ink">
              {name}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

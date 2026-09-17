import type { ReactNode } from 'react';

/** amazon.in's Prime Video entry point for non-subscribers mirrors
 *  primevideo.com/offers/nonprimehomepage: a stack of full-bleed promo panels
 *  (join hero, movie rentals, bundled subscriptions) — no browse rails, because
 *  you are being sold the membership. Media collages are built from our own
 *  self-hosted Prime artwork. Purely presentational; the page supplies the data. */

export interface NonPrimeLandingProps {
  signInHref: string;
  rentHref: string;
  /** landscape 16:9 backdrops for the hero mosaic. */
  heroImages: string[];
  /** portrait posters for the rentals collage. */
  rentImages: string[];
  /** third-party channel/subscription names for the grid. */
  channels: string[];
}

function Pill({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="inline-flex h-[46px] items-center justify-center rounded-[6px] bg-white px-7 text-[15px] font-bold text-black transition hover:bg-white/90">
      {children}
    </a>
  );
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-2 lg:gap-10 ${className}`}>
      {children}
    </section>
  );
}

function Copy({ heading, sub, cta }: { heading: string; sub: string; cta: ReactNode }) {
  return (
    <div className="max-w-[440px]">
      <h2 className="text-[32px] font-extrabold leading-[1.1] sm:text-[40px]">{heading}</h2>
      <p className="mt-4 text-[15px] leading-6 text-white/70 sm:text-[16px]">{sub}</p>
      <div className="mt-7">{cta}</div>
    </div>
  );
}

export function NonPrimeLanding({ signInHref, rentHref, heroImages, rentImages, channels }: NonPrimeLandingProps) {
  return (
    <div className="pb-6">
      {/* Panel 1 — Join hero: title mosaic of landscape backdrops on a blue glow */}
      <Panel>
        <Copy
          heading="Welcome to Prime Video"
          sub="Join Prime to watch the latest movies, TV shows and award-winning Amazon Originals."
          cta={<Pill href={signInHref}>Sign in to join Prime</Pill>}
        />
        <div className="relative isolate">
          <div className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(circle_at_55%_45%,rgba(31,79,143,0.55),transparent_62%)]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {heroImages.slice(0, 9).map((src, i) => (
              <div
                key={src}
                className={`overflow-hidden rounded-[8px] shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/10 ${i % 3 === 1 ? 'sm:translate-y-5' : ''}`}
              >
                <img src={src} alt="" loading="lazy" className="aspect-video h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* Panel 2 — Movie rentals: portrait posters, slightly fanned */}
      <Panel className="border-t border-white/10">
        <Copy
          heading="Movie rentals on Prime Video"
          sub="Early Access to new movies, before digital subscription. Rent the latest releases without a membership."
          cta={<Pill href={rentHref}>Rent now</Pill>}
        />
        <div className="relative isolate lg:order-first">
          <div className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(circle_at_45%_45%,rgba(31,79,143,0.5),transparent_62%)]" />
          <div className="flex justify-center gap-3 sm:gap-4">
            {rentImages.slice(0, 5).map((src, i) => {
              const rot = ['-rotate-6', '-rotate-3', 'rotate-0', 'rotate-3', 'rotate-6'][i] ?? 'rotate-0';
              const lift = i === 2 ? '-translate-y-3' : i === 1 || i === 3 ? '-translate-y-1' : 'translate-y-2';
              return (
                <div
                  key={src}
                  className={`w-[19%] overflow-hidden rounded-[8px] shadow-[0_10px_28px_rgba(0,0,0,0.5)] ring-1 ring-white/10 transition ${rot} ${lift} hover:z-10 hover:rotate-0`}
                >
                  <img src={src} alt="" loading="lazy" className="aspect-[2/3] h-full w-full object-cover" />
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* Panel 3 — Bundled subscriptions: grid of channel wordmark tiles */}
      <Panel className="border-t border-white/10">
        <Copy
          heading="Your favourite subscriptions all in one place"
          sub="Subscribe to a variety of premium and specialty content, all easily accessible within the Prime Video app."
          cta={<Pill href={signInHref}>Explore subscriptions</Pill>}
        />
        <div className="relative isolate">
          <div className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(circle_at_55%_45%,rgba(31,79,143,0.45),transparent_62%)]" />
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {channels.slice(0, 9).map((name) => (
              <div
                key={name}
                className="flex aspect-[16/10] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#1b3a63] to-[#0f2138] px-2 text-center text-[13px] font-bold leading-tight text-white/90 ring-1 ring-white/10 sm:text-[15px]"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* mini prime video sign-off, echoing the reference footer */}
      <div className="mt-4 border-t border-white/10 pt-8 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[18px] font-bold tracking-tight">prime video</span>
        </div>
        <p className="mt-3 text-[12px] text-white/45">
          Terms and Privacy Notice · Send us feedback · Help
        </p>
        <p className="mt-2 text-[12px] text-white/35">Unofficial clone — not affiliated with Amazon or Prime Video.</p>
      </div>
    </div>
  );
}

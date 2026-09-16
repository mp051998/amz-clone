'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconChevronRight } from '../icons/index';

export interface HeroSlide {
  eyebrow: string;
  title: string;
  cta: string;
  href: string;
  /** tailwind gradient classes for the panel background */
  bg: string;
  /** 4 product image srcs for the collage */
  images: string[];
}

/** Full-bleed auto-advancing hero (design.md §5 Home hero). Arrows + dots; pauses on hover. */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [i, setI] = useState(0);
  const paused = useRef(false);
  const n = slides.length;
  const go = useCallback((d: number) => setI((p) => (p + d + n) % n), [n]);

  useEffect(() => {
    const t = setInterval(() => { if (!paused.current) setI((p) => (p + 1) % n); }, 5000);
    return () => clearInterval(t);
  }, [n]);

  const s = slides[i];
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured deals"
      className="relative h-[300px] overflow-hidden sm:h-[380px] md:h-[440px]"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      {slides.map((slide, idx) => (
        <div
          key={slide.title}
          aria-hidden={idx !== i}
          className={`absolute inset-0 transition-opacity duration-700 ${slide.bg} ${idx === i ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <div className="mx-auto flex h-full max-w-[1500px] items-center gap-6 px-12 sm:px-12 md:px-20">
            <div className="max-w-[72%] text-white drop-shadow-sm sm:max-w-[46%]">
              <p className="text-[13px] font-semibold uppercase tracking-wide opacity-90">{slide.eyebrow}</p>
              <h2 className="mt-2 text-[26px] font-bold leading-tight sm:text-[34px] md:text-[42px]">{slide.title}</h2>
              <a href={slide.href} className="mt-5 inline-block rounded-pill bg-white px-6 py-2 text-[14px] font-bold text-ink shadow-sm transition hover:bg-surface-2">
                {slide.cta}
              </a>
            </div>
            <div className="hidden flex-1 grid-cols-2 gap-3 sm:grid">
              {slide.images.slice(0, 4).map((src, k) => (
                <div key={k} className="flex h-[100px] items-center justify-center rounded-[10px] bg-white/95 p-2 shadow-md md:h-[130px]">
                  <img src={src} alt="" className="h-full w-full object-contain" loading={idx === 0 ? 'eager' : 'lazy'} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* bottom fade into the grey page band */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-surface-band" />

      <button type="button" aria-label="Previous" onClick={() => go(-1)}
        className="absolute left-2 top-1/2 z-10 flex h-16 w-9 -translate-y-1/2 items-center justify-center rounded-[4px] bg-white/40 text-ink hover:bg-white/70">
        <IconChevronRight width={22} height={22} className="rotate-180" />
      </button>
      <button type="button" aria-label="Next" onClick={() => go(1)}
        className="absolute right-2 top-1/2 z-10 flex h-16 w-9 -translate-y-1/2 items-center justify-center rounded-[4px] bg-white/40 text-ink hover:bg-white/70">
        <IconChevronRight width={22} height={22} />
      </button>

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {slides.map((slide, idx) => (
          <button key={slide.title} type="button" aria-label={`Go to slide ${idx + 1}`} onClick={() => setI(idx)}
            className={`h-2 w-2 rounded-full transition ${idx === i ? 'w-5 bg-white' : 'bg-white/50 hover:bg-white/80'}`} />
        ))}
      </div>
    </section>
  );
}

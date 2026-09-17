'use client';
import { useRef, useState } from 'react';
import { IconMenu } from '../icons/index';
import { PrimeLogo } from '../brand/PrimeLogo';

/** Content for the hover flyout on a single sub-nav item (e.g. Prime on amazon.in). */
export interface NavFlyout {
  /** the sub-nav label that triggers the flyout, e.g. "Prime". */
  item: string;
  heading: string;
  sub: string;
  cta: string;
  href: string;
}

export interface SubNavProps {
  items: string[];
  /** department display names, paired with hrefs by index */
  departments: string[];
  departmentHrefs?: string[];
  itemHrefs?: Record<string, string>;
  /** optional hover flyout attached to one item (amazon.in Prime membership card). */
  flyout?: NavFlyout;
}

/** the "amazon prime" lockup shown in the corner of the flyout — inline, no image. */
function PrimeMark() {
  return (
    <span className="inline-flex select-none items-end gap-1.5 leading-none">
      <span className="text-[15px] font-bold text-ink">amazon</span>
      <PrimeLogo className="h-[20px]" />
    </span>
  );
}

/** 39px strip; "All" opens a flyout of departments (design.md §5 Sub-nav). One item
 *  (Prime on amazon.in) can carry a hover membership card, rendered at the nav level so
 *  the horizontally-scrolling item row never clips it. */
export function SubNav({ items, departments, departmentHrefs, itemHrefs, flyout }: SubNavProps) {
  const [open, setOpen] = useState(false);
  const [primeOpen, setPrimeOpen] = useState(false);
  const [primeLeft, setPrimeLeft] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hrefForItem = (item: string) => itemHrefs?.[item] ?? '/s';

  const CARD_W = 360;
  const openPrime = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (itemRef.current && rowRef.current) {
      // left of the item within the (positioned) nav container, accounting for scroll,
      // then clamped so the 360px card never spills past either edge of the strip.
      const raw = itemRef.current.offsetLeft - rowRef.current.scrollLeft;
      const maxLeft = rowRef.current.clientWidth - CARD_W - 8;
      setPrimeLeft(Math.max(8, Math.min(raw, maxLeft)));
    }
    setPrimeOpen(true);
  };
  const closePrime = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPrimeOpen(false), 140);
  };

  return (
    <nav className="relative bg-nav-main text-white">
      <div className="relative mx-auto max-w-[1500px]">
        <div ref={rowRef} className="flex h-[39px] items-center gap-4 overflow-x-auto px-3 text-[14px] whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" aria-expanded={open} aria-controls="all-flyout" onClick={() => setOpen((v) => !v)} className="hidden shrink-0 items-center gap-1 rounded-[3px] px-1 font-bold hover:outline hover:outline-1 hover:outline-white md:flex">
            <IconMenu width={18} height={18} /> All
          </button>
          {items.map((item) =>
            flyout && item === flyout.item ? (
              <a
                key={item}
                ref={itemRef}
                href={hrefForItem(item)}
                onMouseEnter={openPrime}
                onMouseLeave={closePrime}
                className="flex shrink-0 items-center gap-0.5 rounded-[2px] px-1 hover:outline hover:outline-1 hover:outline-white"
              >
                {item}
                <span aria-hidden className="text-[10px] leading-none text-white/80">▾</span>
              </a>
            ) : (
              <a key={item} href={hrefForItem(item)} className="shrink-0 rounded-[2px] px-1 hover:outline hover:outline-1 hover:outline-white">{item}</a>
            ),
          )}
          {/* trailing spacer so the last item clears the fade when scrolled to the end */}
          <span aria-hidden className="w-6 shrink-0" />
        </div>
        {/* right-edge fade signalling the strip scrolls horizontally (phones) */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-nav-main to-transparent md:hidden" />

        {/* Prime membership hover card (amazon.in) */}
        {flyout && primeOpen ? (
          <div
            onMouseEnter={openPrime}
            onMouseLeave={closePrime}
            style={{ left: primeLeft }}
            className="absolute top-full z-30 hidden pt-2 md:block"
          >
            <div className="relative w-[360px] rounded-[4px] bg-white p-5 text-ink shadow-dropdown">
              <span aria-hidden className="absolute -top-1.5 left-8 h-3 w-3 rotate-45 bg-white" />
              <p className="text-center text-[26px] font-bold leading-[1.1]">{flyout.heading}</p>
              <p className="mt-2 text-center text-[14px] text-ink">{flyout.sub}</p>
              <div className="mt-4 flex h-[170px] items-center justify-center overflow-hidden rounded-[3px] bg-[#3d4eff]">
                <div className="flex flex-col items-center gap-2 text-white">
                  <span className="text-[54px] leading-none" aria-hidden>📦</span>
                  <span className="rounded-full bg-white/95 px-3 py-1 text-[12px] font-bold text-[#0b466b]">FREE 1-day delivery</span>
                </div>
              </div>
              <a href={flyout.href} className="mt-4 block rounded-pill bg-[#f7ca00] py-2.5 text-center text-[15px] font-bold text-ink hover:bg-cta-yellow-hover">
                {flyout.cta}
              </a>
              <div className="mt-3 flex justify-end"><PrimeMark /></div>
            </div>
          </div>
        ) : null}
      </div>

      {open ? (
        <>
          <div className="fixed inset-0 top-[99px] z-10 bg-[rgb(0_0_0_/_0.5)]" onClick={() => setOpen(false)} aria-hidden />
          <div id="all-flyout" className="absolute left-0 top-full z-20 max-h-[70vh] w-[365px] overflow-y-auto bg-white py-2 text-ink shadow-dropdown">
            <p className="px-4 py-3 text-[18px] font-bold">Shop by Department</p>
            <ul className="border-t border-line">
              {departments.map((d, i) => (
                <li key={d}><a href={departmentHrefs?.[i] ?? '/s'} onClick={() => setOpen(false)} className="flex items-center justify-between px-4 py-2 text-[14px] hover:bg-surface-2">{d}<span className="text-ink-4">›</span></a></li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </nav>
  );
}

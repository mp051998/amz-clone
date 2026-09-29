import { Wordmark } from './Wordmark';

export interface FooterLink { label: string; href: string; external?: boolean }
export interface FooterColumn { heading: string; links: FooterLink[] }
export interface FooterStore { id: 'US' | 'IN'; label: string; meta: string; href: string; current: boolean }
export interface FooterProps {
  storeName: string;
  columns: FooterColumn[];
  /** store switch (US ⇄ India). */
  stores: FooterStore[];
  legal: FooterLink[];
  /** home href for the mark (store-prefixed). */
  homeHref?: string;
}

const extAttrs = (external?: boolean) => (external ? { target: '_blank', rel: 'noopener noreferrer' } : {});

/** Calm footer: mark + link columns, store switch, legal line, demo disclaimer (design.md §5 Footer). */
export function Footer({ columns, stores, legal, homeHref = '/' }: FooterProps) {
  return (
    <footer className="mt-16 border-t border-line bg-surface text-ink">
      <div className="mx-auto grid max-w-page gap-10 px-[clamp(16px,3vw,24px)] py-12 md:grid-cols-[minmax(200px,1.2fr)_repeat(4,minmax(0,1fr))]">
        <div className="flex flex-col items-start gap-3">
          <a href={homeHref} aria-label="Store home" className="no-underline"><Wordmark /></a>
          <p className="m-0 max-w-[280px] text-[14px] leading-[1.5] text-ink-2">Shop by what matters to you. Every pick explained, every comparison ends in a verdict.</p>
        </div>
        {columns.map((c) => (
          <nav key={c.heading} aria-label={c.heading}>
            <h2 className="m-0 mb-3 font-mono text-[12px] font-medium uppercase tracking-[0.04em] text-ink-3">{c.heading}</h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {c.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} {...extAttrs(l.external)} className="inline-flex min-h-8 items-center text-[14px] text-ink-2 no-underline hover:text-accent-ink hover:underline">{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-line-2">
        <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-4 px-[clamp(16px,3vw,24px)] py-5">
          <div role="group" aria-label="Choose store" className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">Store</span>
            {stores.map((s) => (
              <a
                key={s.id}
                href={s.href}
                aria-current={s.current ? 'true' : undefined}
                className={`inline-flex min-h-10 items-center gap-2 rounded-pill border px-3.5 text-[14px] no-underline ${
                  s.current ? 'border-ink bg-ink text-white hover:text-white' : 'border-line-3 bg-surface text-ink hover:border-ink hover:text-ink'
                }`}
              >
                {s.label} <span className={`font-mono text-[12px] ${s.current ? 'text-white/70' : 'text-ink-3'}`}>{s.meta}</span>
              </a>
            ))}
          </div>
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 text-[13px]">
            {legal.map((l) => (
              <li key={l.label}><a href={l.href} {...extAttrs(l.external)} className="text-ink-3 no-underline hover:text-accent-ink hover:underline">{l.label}</a></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-bg">
        <p className="m-0 mx-auto max-w-page px-[clamp(16px,3vw,24px)] py-5 text-[12px] leading-[1.5] text-ink-3">
          Unofficial demo store built as a coding exercise — no real orders, payments or deliveries. Not affiliated with, endorsed by, or connected to Amazon.com, Inc. or any other retailer. Product names, logos and images belong to their respective owners.
        </p>
      </div>
    </footer>
  );
}

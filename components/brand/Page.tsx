import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Kicker } from '../decision/Badges';

/**
 * Building blocks for the secondary pages (deals, bestsellers, membership, help, legal…) so they share
 * one calm layout (design.md §6): max-w-page container with clamp gutters, mono kicker + page title,
 * white bordered cards, sections separated by whitespace rather than coloured bands.
 */

/** Page container: max-w-page, side padding clamp(16px,3vw,24px), centred. */
export const pageX = 'mx-auto w-full max-w-page px-[clamp(16px,3vw,24px)]';
/** Narrow reading column (legal, help articles). */
export const pageXNarrow = 'mx-auto w-full max-w-[860px] px-[clamp(16px,3vw,24px)]';

/** Card grid used for product and info cards (repeat(auto-fill, minmax(250px,1fr)), gap 14). */
export const cardGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-3.5';

export function Page({ children, className, narrow = false }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return (
    <div className={cn(narrow ? pageXNarrow : pageX, 'flex flex-col gap-11 pb-16 pt-7 sm:pt-10', className)}>
      {children}
    </div>
  );
}

/** Kicker + page title (clamp 26–32px / 600) + optional lede and actions. */
export function PageHead({ kicker, title, children, actions, className }: { kicker?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-col gap-2', className)}>
      {kicker ? <Kicker as="p">{kicker}</Kicker> : null}
      <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
      {children ? <div className="max-w-[680px] text-[15px] leading-relaxed text-ink-2">{children}</div> : null}
      {actions ? <div className="mt-2 flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}

/** Section with a 22px/600 title, optional right-aligned note, then content. */
export function Section({ title, note, id, children, className }: { title?: ReactNode; note?: ReactNode; id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('flex scroll-mt-28 flex-col gap-4', className)}>
      {title || note ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title ? <h2 className="m-0 text-[22px] font-semibold leading-tight text-ink">{title}</h2> : null}
          {note ? <span className="text-[14px] text-ink-3">{note}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** White card, 1px line border, radius 12. */
export function Card({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' | 'article' | 'section' }) {
  return <Tag className={cn('rounded-card border border-line bg-surface p-[18px]', className)}>{children}</Tag>;
}

/** Title + body info card (benefits, formats, services). Optional mono index ("01"). */
export function InfoCard({ index, title, children, footer, className }: { index?: string; title: ReactNode; children?: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col gap-2', className)}>
      {index ? <span className="font-mono text-[12px] font-medium text-ink-3">{index}</span> : null}
      <h3 className="m-0 text-[17px] font-semibold leading-tight text-ink">{title}</h3>
      {children ? <p className="m-0 flex-1 text-[14px] leading-relaxed text-ink-2">{children}</p> : null}
      {footer ? <div className="mt-1">{footer}</div> : null}
    </Card>
  );
}

/** Underlined text link with an arrow, for in-card "next step" links. */
export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} className={cn('inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-ink underline underline-offset-2 hover:text-accent-ink', className)}>
      {children} <span aria-hidden>→</span>
    </a>
  );
}

/** Quiet demo note at the end of a page: nothing here is a real service. */
export function DemoNote({ children }: { children: ReactNode }) {
  return <p className="m-0 border-t border-line-2 pt-4 text-[13px] leading-relaxed text-ink-3">{children}</p>;
}

/** The membership mark from the prototype: "PLUS" — ink fill, white 11px bold, radius 4. */
export function PlusBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-tag bg-ink px-[5px] py-px text-[11px] font-bold leading-[1.4] tracking-[0.02em] text-white', className)}>
      PLUS
    </span>
  );
}

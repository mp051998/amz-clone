import { cn } from '../lib/cn';

export interface Crumb { label: string; href?: string }

/** Quiet 13px trail with › separators in ink-3; last crumb is the current page when it has no href. */
export function Breadcrumbs({ trail, className }: { trail: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-[13px] text-ink-3', className)}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        {trail.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden>›</span> : null}
            {c.href ? (
              <a href={c.href} className="text-ink-3 no-underline hover:text-accent-ink hover:underline">{c.label}</a>
            ) : (
              <span aria-current="page" className="text-ink-2">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

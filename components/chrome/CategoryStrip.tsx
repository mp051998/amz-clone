import { cn } from '../lib/cn';

export interface CategoryLink { label: string; href: string; current?: boolean }

/** Horizontal category strip under the header; hover pills (design.md §5 Category strip). */
export function CategoryStrip({ links }: { links: CategoryLink[] }) {
  if (!links.length) return null;
  return (
    <nav aria-label="Categories" className="border-t border-line-2">
      <ul className="no-scrollbar m-0 mx-auto flex max-w-page list-none gap-1 overflow-x-auto whitespace-nowrap px-[clamp(10px,2vw,18px)] py-1">
        {links.map((l) => (
          <li key={l.href + l.label} className="flex-none">
            <a
              href={l.href}
              aria-current={l.current ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center rounded-chip px-3 text-[14px] no-underline transition-colors hover:bg-surface-2 hover:text-ink',
                l.current ? 'font-semibold text-ink' : 'text-ink-2',
              )}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

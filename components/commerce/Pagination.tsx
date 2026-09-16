import { cn } from '../lib/cn';
export interface PaginationProps { page: number; pageCount: number; hrefFor: (n: number) => string }
/** Bordered page boxes, current has an ink border (design.md §5 Pagination). */
export function Pagination({ page, pageCount, hrefFor }: PaginationProps) {
  return (
    <nav className="mt-6 flex justify-center gap-2" aria-label="Pagination">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) =>
        n === page ? (
          <span key={n} aria-current="page" className="flex h-9 min-w-9 items-center justify-center rounded-[8px] border border-ink px-2 text-[14px]">{n}</span>
        ) : (
          <a key={n} href={hrefFor(n)} className={cn('flex h-9 min-w-9 items-center justify-center rounded-[8px] border border-line px-2 text-[14px] hover:bg-surface-2')}>{n}</a>
        ),
      )}
    </nav>
  );
}

export interface PaginationProps { page: number; pageCount: number; hrefFor: (n: number) => string }
/** Bordered page boxes on white; current has an ink border (design.md §5 Pagination). */
export function Pagination({ page, pageCount, hrefFor }: PaginationProps) {
  const box = 'flex h-9 min-w-9 items-center justify-center rounded-input border bg-surface px-2 text-[14px]';
  return (
    <nav className="mt-6 flex justify-center gap-2" aria-label="Pagination">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) =>
        n === page ? (
          <span key={n} aria-current="page" className={`${box} border-ink font-semibold text-ink`}>{n}</span>
        ) : (
          <a key={n} href={hrefFor(n)} className={`${box} border-line-3 text-ink-2 hover:border-ink hover:text-ink`}>{n}</a>
        ),
      )}
    </nav>
  );
}

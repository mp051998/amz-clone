import { Pill } from '@/components/decision/Pill';
import { LIST_SORT_LABEL, LIST_SORTS, type ListSort as Sort } from '@/lib/list-sort';

/** "Sort by" for a list: one link per order, the current one picked. `href` builds a link to a sort. */
export function ListSort({ sort, href }: { sort: Sort; href: (sort: Sort) => string }) {
  return (
    <nav aria-label="Sort this list" className="flex flex-wrap items-center gap-2">
      <span className="text-[14px] text-ink-3">Sort by</span>
      {LIST_SORTS.map((s) => (
        <Pill key={s} size="sm" selected={s === sort} href={href(s)}>
          {LIST_SORT_LABEL[s]}
        </Pill>
      ))}
    </nav>
  );
}

export interface ToolbarProps { total: number; sorts: string[] }
/** 42px results toolbar: count + sort (design.md §5 Toolbar). */
export function Toolbar({ total, sorts }: ToolbarProps) {
  return (
    <div className="flex h-[42px] items-center justify-between border-b border-line-3 px-2 text-[14px]">
      <span className="text-ink">1-16 of over {total.toLocaleString('en-US')} results</span>
      <label className="flex items-center gap-2">Sort by
        <span className="sr-only">Sort by</span>
        <select aria-label="Sort by" className="h-[31px] rounded-[8px] border border-line-2 bg-surface-2 px-2 text-[13px]">
          {sorts.map((s) => (<option key={s}>{s}</option>))}
        </select>
      </label>
    </div>
  );
}

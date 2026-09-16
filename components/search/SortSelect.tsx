'use client';
import { useRouter } from 'next/navigation';
import { selectClass } from '../lib/controls';

export interface SortOption { label: string; value: string; href: string }

/** Sort dropdown that navigates to a pre-built href on change (design.md §5 Toolbar). */
export function SortSelect({ options, value }: { options: SortOption[]; value: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink">
      <span className="hidden sm:inline">Sort by:</span>
      <select
        aria-label="Sort by"
        value={value}
        onChange={(e) => {
          const opt = options.find((o) => o.value === e.target.value);
          if (opt) router.push(opt.href);
        }}
        className={selectClass}
      >
        {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
}

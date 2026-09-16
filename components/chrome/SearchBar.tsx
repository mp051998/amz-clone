import { IconSearch } from '../icons/index';

export interface SearchBarProps {
  storeName: string;
  departments: string[];
  defaultQuery?: string;
}

/** 38px search with department select + brand-search submit (design.md §5 Search). GET /s?k= so results are shareable. */
export function SearchBar({ storeName, departments, defaultQuery }: SearchBarProps) {
  return (
    <form action="/s" method="get" role="search" className="flex h-[38px] flex-1 overflow-hidden rounded-[8px] bg-white focus-within:ring-[3px] focus-within:ring-[rgb(255_153_0_/_0.6)]">
      <label className="sr-only" htmlFor="dept">Category</label>
      <select id="dept" name="dept" className="max-w-[120px] bg-surface-2 px-2 text-[12px] text-ink-2 outline-none" defaultValue={departments[0]}>
        {departments.map((d) => (<option key={d} value={d}>{d}</option>))}
      </select>
      <input name="k" defaultValue={defaultQuery} className="flex-1 px-3 text-[15px] text-ink outline-none" placeholder={`Search ${storeName}`} aria-label={`Search ${storeName}`} type="search" />
      <button type="submit" aria-label="Go" className="flex w-[45px] items-center justify-center bg-brand-search text-ink hover:bg-brand-search-hover">
        <IconSearch />
      </button>
    </form>
  );
}

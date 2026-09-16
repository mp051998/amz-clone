import { IconSearch } from '../icons/index';

export interface SearchDept { label: string; value: string }
export interface SearchBarProps {
  storeName: string;
  departments: SearchDept[];
  defaultQuery?: string;
  defaultDept?: string;
}

/** 38px search with department select + brand-search submit (design.md §5 Search). GET /s?k= so results are shareable. */
export function SearchBar({ storeName, departments, defaultQuery, defaultDept = '' }: SearchBarProps) {
  return (
    <form action="/s" method="get" role="search" className="flex h-[40px] min-w-0 flex-1 overflow-hidden rounded-[8px] bg-white focus-within:ring-[3px] focus-within:ring-[rgb(255_153_0_/_0.65)]">
      <select name="dept" aria-label="Category" className="hidden max-w-[130px] shrink-0 cursor-pointer border-r border-line bg-gradient-to-b from-surface-4 to-surface-2 px-2.5 text-[12px] text-ink-2 outline-none hover:to-line-soft sm:block" defaultValue={defaultDept}>
        {departments.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
      </select>
      <input name="k" defaultValue={defaultQuery} className="min-w-0 flex-1 px-3 text-[15px] text-ink outline-none" placeholder={`Search ${storeName}`} aria-label={`Search ${storeName}`} type="search" />
      <button type="submit" aria-label="Go" className="flex w-[45px] shrink-0 items-center justify-center bg-brand-search text-ink hover:bg-brand-search-hover">
        <IconSearch />
      </button>
    </form>
  );
}

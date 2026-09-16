import { IconSearch } from '../icons/index';
import { CategorySelect } from './CategorySelect';

export interface SearchDept { label: string; value: string }
export interface SearchBarProps {
  storeName: string;
  departments: SearchDept[];
  /** where the GET search submits — '/s' for US, '/in/s' for India */
  actionPath?: string;
  defaultQuery?: string;
  defaultDept?: string;
}

/** 38px search with department select + brand-search submit (design.md §5 Search). GET /s?k= so results are shareable. */
export function SearchBar({ storeName, departments, actionPath = '/s', defaultQuery, defaultDept = '' }: SearchBarProps) {
  return (
    <form action={actionPath} method="get" role="search" className="flex h-[40px] min-w-0 flex-1 rounded-[8px] bg-white focus-within:ring-[3px] focus-within:ring-[rgb(255_153_0_/_0.65)]">
      <CategorySelect departments={departments} defaultDept={defaultDept} />
      <input name="k" defaultValue={defaultQuery} className="min-w-0 flex-1 rounded-l-[8px] px-3 text-[15px] text-ink outline-none sm:rounded-l-none" placeholder={`Search ${storeName}`} aria-label={`Search ${storeName}`} type="search" />
      <button type="submit" aria-label="Go" className="flex w-[45px] shrink-0 items-center justify-center rounded-r-[8px] bg-brand-search text-ink hover:bg-brand-search-hover">
        <IconSearch />
      </button>
    </form>
  );
}

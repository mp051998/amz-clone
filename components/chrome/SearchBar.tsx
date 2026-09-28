import { cn } from '../lib/cn';

export interface SearchDept { label: string; value: string }
export interface SearchBarProps {
  /** where the GET search submits — '/s' for US, '/in/s' for India. */
  actionPath?: string;
  defaultQuery?: string;
  placeholder?: string;
  /** header = 44px row; hero = the big home search (radius 14, shadow-hero, 17px). */
  size?: 'header' | 'hero';
  /** kept for older callers; the new design has no department select. */
  storeName?: string;
  departments?: SearchDept[];
  defaultDept?: string;
  className?: string;
}

/** Bordered search + accent Search button; GET ?k= so results are shareable (design.md §5 Search). */
export function SearchBar({ actionPath = '/s', defaultQuery, placeholder = 'Search products, brands, and more', size = 'header', defaultDept, className }: SearchBarProps) {
  const hero = size === 'hero';
  return (
    <form
      action={actionPath}
      method="get"
      role="search"
      className={cn(
        'flex min-w-0 flex-1 items-stretch overflow-hidden border-[1.5px] border-ink bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink',
        hero ? 'rounded-panel shadow-hero' : 'rounded-input',
        className,
      )}
    >
      {defaultDept ? <input type="hidden" name="dept" value={defaultDept} /> : null}
      <input
        name="k"
        type="search"
        defaultValue={defaultQuery}
        placeholder={placeholder}
        aria-label="Search"
        enterKeyHint="search"
        className={cn(
          'min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none',
          hero ? 'px-[18px] py-[18px] text-[17px]' : 'px-3.5 py-[11px] text-[16px] md:text-[15px]',
        )}
      />
      <button
        type="submit"
        className={cn('flex-none border-0 bg-accent font-semibold text-ink hover:bg-accent-hover focus-visible:outline-offset-[-3px]', hero ? 'px-[26px] text-[16px]' : 'px-4 text-[14px] md:px-[18px]')}
      >
        Search
      </button>
    </form>
  );
}

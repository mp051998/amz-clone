'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { SUGGEST_MIN, type Suggestions } from '@/lib/search';
import type { Market } from '@/lib/types';
import { cn } from '../lib/cn';

export interface SearchDept { label: string; value: string }
export interface SearchBarProps {
  /** where the GET search submits — '/s' for US, '/in/s' for India. */
  actionPath?: string;
  /** the store to suggest from (default: from `actionPath`). */
  market?: Market;
  defaultQuery?: string;
  placeholder?: string;
  /** the box's accessible name (default "Search"). */
  label?: string;
  /** header = 44px row; hero = the big home search (radius 14, shadow-hero, 17px). */
  size?: 'header' | 'hero';
  /** kept for older callers; the new design has no department select. */
  storeName?: string;
  departments?: SearchDept[];
  defaultDept?: string;
  className?: string;
}

interface Option {
  key: string;
  href: string;
  label: ReactNode;
  image?: string | null;
}

const DEBOUNCE_MS = 120;
const typedLength = (q: string) => q.replace(/[^\p{L}\p{N}]/gu, '').length;

function Glass() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 flex-none text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="4.75" />
      <path d="m10.5 10.5 3.5 3.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Bordered search + accent Search button; GET ?k= so results are shareable (design.md §5 Search).
 * As you type it suggests (combobox): completions of the last word, the query in its top
 * departments, and a few products. Arrow keys move through them, Enter opens one, Escape closes.
 */
export function SearchBar({ actionPath = '/s', market, defaultQuery, placeholder = 'Search products, brands, and more', label = 'Search', size = 'header', defaultDept, className }: SearchBarProps) {
  const hero = size === 'hero';
  const store: Market = market ?? (actionPath.startsWith('/in/') ? 'IN' : 'US');
  const base = actionPath.replace(/\/s$/, '');
  const listId = useId();

  const [value, setValue] = useState(defaultQuery ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [cache, setCache] = useState<Record<string, Suggestions>>({});
  /** the last query with an answer, shown while the next one loads */
  const [answered, setAnswered] = useState('');

  const q = value.trim();
  const wanted = typedLength(q) >= SUGGEST_MIN;
  useEffect(() => {
    if (!wanted || cache[q]) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v1/suggest?market=${store}&q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((res) => (res.ok ? (res.json() as Promise<Suggestions>) : null))
        .then((s) => {
          if (!s) return;
          setCache((c) => ({ ...c, [q]: { total: s.total, terms: s.terms, departments: s.departments, products: s.products } }));
          setAnswered(q);
        })
        .catch(() => {}); // suggestions are a nicety; the search itself still works
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, wanted, store, cache]);

  const shown = wanted ? (cache[q] ?? cache[answered]) : undefined;
  const shownQ = cache[q] ? q : answered;
  const typed = shownQ.toLowerCase();
  const find = (params: Record<string, string>) => `${actionPath}?${new URLSearchParams(params).toString()}`;
  const terms: Option[] = (shown?.terms ?? []).map((t) => ({
    key: `t:${t.text}`,
    href: find({ k: t.text }),
    label: t.text.startsWith(typed) ? <>{t.text.slice(0, typed.length)}<strong className="font-semibold">{t.text.slice(typed.length)}</strong></> : t.text,
  }));
  // "sony headphones in Electronics": the top completion scoped to each top department; with
  // no completion the words only matched a department's name ("electro"), so offer the department
  const scoped = shown?.terms[0]?.text;
  const depts: Option[] = (shown?.departments ?? []).map((d) =>
    scoped
      ? { key: `d:${d.slug}`, href: find({ k: scoped, dept: d.slug }), label: <>{scoped} <span className="text-ink-3">in</span> <strong className="font-semibold">{d.name}</strong></> }
      : { key: `d:${d.slug}`, href: find({ dept: d.slug }), label: <><strong className="font-semibold">{d.name}</strong> <span className="text-ink-3">department</span></> },
  );
  const products: Option[] = (shown?.products ?? []).map((p) => ({ key: `p:${p.id}`, href: `${base}/product/${encodeURIComponent(p.id)}`, label: p.title, image: p.image }));
  const options = [...terms, ...depts, ...products];
  const visible = open && wanted && options.length > 0;
  const current = visible && active >= 0 && active < options.length ? active : -1;
  const optionId = (i: number) => `${listId}-${i}`;
  const go = (o: Option) => window.location.assign(o.href);

  const row = (o: Option, i: number) => (
    <li
      key={o.key}
      id={optionId(i)}
      role="option"
      aria-selected={i === current}
      data-href={o.href}
      onClick={() => go(o)}
      onMouseEnter={() => setActive(i)}
      className={cn('flex cursor-pointer items-center gap-3 rounded-[6px] px-2.5 py-2 leading-snug text-ink', hero ? 'text-[16px]' : 'text-[15px]', i === current && 'bg-surface-2')}
    >
      {o.image !== undefined ? (
        <span className="hatch relative h-9 w-9 flex-none overflow-hidden rounded-[6px] bg-surface">
          {o.image ? <img src={o.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-[6%] mix-blend-multiply" /> : null}
        </span>
      ) : (
        <Glass />
      )}
      <span className={cn('min-w-0', o.image !== undefined && 'line-clamp-1')}>{o.label}</span>
    </li>
  );

  return (
    // the header box fills its row; the hero sits in a column
    <div className={cn('relative flex min-w-0', !hero && 'flex-1', className)}>
      <form
        action={actionPath}
        method="get"
        role="search"
        className={cn(
          'flex min-w-0 flex-1 items-stretch overflow-hidden border-[1.5px] border-ink bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink',
          hero ? 'rounded-panel shadow-hero' : 'rounded-input',
        )}
      >
        {defaultDept ? <input type="hidden" name="dept" value={defaultDept} /> : null}
        <input
          name="k"
          type="search"
          value={value}
          onChange={(ev) => {
            setValue(ev.currentTarget.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(ev) => {
            if (ev.key === 'Escape') {
              if (visible) ev.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
              if (!options.length || !wanted) return;
              ev.preventDefault();
              setOpen(true);
              const n = options.length;
              if (ev.key === 'ArrowDown') setActive(current < 0 ? 0 : (current + 1) % n);
              else setActive(current <= 0 ? n - 1 : current - 1);
            } else if (ev.key === 'Enter' && current >= 0) {
              ev.preventDefault();
              go(options[current]);
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          autoComplete="off"
          enterKeyHint="search"
          className={cn(
            'min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none',
            hero ? 'px-[18px] py-[18px] text-[17px]' : 'px-3.5 py-[11px] text-[16px] md:text-[15px]',
          )}
        />
        <button
          type="submit"
          className={cn('flex-none border-0 bg-accent font-semibold text-on-accent hover:bg-accent-hover focus-visible:outline-offset-[-3px]', hero ? 'px-[26px] text-[16px]' : 'px-4 text-[14px] md:px-[18px]')}
        >
          Search
        </button>
      </form>
      <ul
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!visible}
        // keep focus in the box so a click lands on the option
        onMouseDown={(ev) => ev.preventDefault()}
        className="absolute inset-x-0 top-[calc(100%+6px)] z-50 m-0 max-h-[70vh] list-none overflow-auto rounded-input border border-line bg-surface p-1.5 shadow-hero"
      >
        {[...terms, ...depts].map((o, i) => row(o, i))}
        {products.length && terms.length + depts.length ? <li role="presentation" aria-hidden className="mx-2.5 my-1 h-px bg-line-2" /> : null}
        {products.map((o, i) => row(o, terms.length + depts.length + i))}
      </ul>
      <span className="sr-only" aria-live="polite">
        {visible ? `${options.length} suggestions. Use the up and down arrows to choose one.` : ''}
      </span>
    </div>
  );
}

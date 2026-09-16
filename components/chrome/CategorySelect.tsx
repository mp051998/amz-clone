'use client';
import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '../icons/index';
import type { SearchDept } from './SearchBar';

/**
 * Amazon's search-scope dropdown. The button is only as wide as the *selected* label;
 * the menu is as wide as the *longest* option (min-width = button, then grows to content).
 * A hidden input carries `dept` so the surrounding GET search form still submits it.
 */
export function CategorySelect({ departments, defaultDept = '' }: { departments: SearchDept[]; defaultDept?: string }) {
  const [value, setValue] = useState(defaultDept);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = departments.find((d) => d.value === value) ?? departments[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative hidden shrink-0 sm:block">
      <input type="hidden" name="dept" value={value} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Search in department"
        className="flex h-full items-center gap-1 rounded-l-[8px] border-r border-line bg-gradient-to-b from-surface-4 to-surface-2 px-2.5 text-[12px] text-ink-2 hover:to-line-soft"
      >
        <span className="max-w-[160px] truncate whitespace-nowrap">{selected?.label}</span>
        <IconChevronDown width={12} height={12} className="shrink-0" />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-30 mt-0.5 max-h-[70vh] min-w-full overflow-auto rounded-[3px] border border-line bg-white py-1 text-ink shadow-lg"
        >
          {departments.map((d) => (
            <li key={d.value} role="option" aria-selected={d.value === value}>
              <button
                type="button"
                onClick={() => {
                  setValue(d.value);
                  setOpen(false);
                }}
                className={`block w-full whitespace-nowrap px-3 py-1 text-left text-[13px] hover:bg-surface-2 ${
                  d.value === value ? 'bg-surface-2 font-bold text-ink' : 'text-ink-2'
                }`}
              >
                {d.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

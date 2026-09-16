'use client';
import { useState } from 'react';
import { IconMenu } from '../icons/index';

export interface SubNavProps {
  items: string[];
  /** department display names, paired with hrefs by index */
  departments: string[];
  departmentHrefs?: string[];
  itemHrefs?: Record<string, string>;
}

/** 39px strip; "All" opens a flyout of departments (design.md §5 Sub-nav). */
export function SubNav({ items, departments, departmentHrefs, itemHrefs }: SubNavProps) {
  const [open, setOpen] = useState(false);
  const hrefForItem = (item: string) => itemHrefs?.[item] ?? '/s';
  return (
    <nav className="relative bg-nav-main text-white">
      <div className="mx-auto flex h-[39px] max-w-[1500px] items-center gap-4 overflow-x-auto px-3 text-[14px] whitespace-nowrap">
        <button type="button" aria-expanded={open} aria-controls="all-flyout" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 rounded-[3px] px-1 font-bold hover:outline hover:outline-1 hover:outline-white">
          <IconMenu width={18} height={18} /> All
        </button>
        {items.map((item) => (
          <a key={item} href={hrefForItem(item)} className="rounded-[2px] px-1 hover:outline hover:outline-1 hover:outline-white">{item}</a>
        ))}
      </div>
      {open ? (
        <>
          <div className="fixed inset-0 top-[99px] z-10 bg-[rgb(0_0_0_/_0.5)]" onClick={() => setOpen(false)} aria-hidden />
          <div id="all-flyout" className="absolute left-0 top-full z-20 max-h-[70vh] w-[365px] overflow-y-auto bg-white py-2 text-ink shadow-dropdown">
            <p className="px-4 py-3 text-[18px] font-bold">Shop by Department</p>
            <ul className="border-t border-line">
              {departments.map((d, i) => (
                <li key={d}><a href={departmentHrefs?.[i] ?? '/s'} onClick={() => setOpen(false)} className="flex items-center justify-between px-4 py-2 text-[14px] hover:bg-surface-2">{d}<span className="text-ink-4">›</span></a></li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </nav>
  );
}

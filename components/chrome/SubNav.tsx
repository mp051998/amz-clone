'use client';
import { useState } from 'react';
import { IconMenu } from '../icons/index';

export interface SubNavProps {
  items: string[];
  departments: string[];
}

/** 39px strip; "All" opens a flyout of departments (design.md §5 Sub-nav). */
export function SubNav({ items, departments }: SubNavProps) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="relative bg-nav-main text-white">
      <div className="mx-auto flex h-[39px] max-w-[1500px] items-center gap-4 overflow-x-auto px-3 text-[14px] whitespace-nowrap">
        <button type="button" aria-expanded={open} aria-controls="all-flyout" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 rounded-[3px] px-1 font-bold hover:outline hover:outline-1 hover:outline-white">
          <IconMenu width={18} height={18} /> All
        </button>
        {items.map((item) => (
          <a key={item} href="/s" className="rounded-[2px] px-1 hover:outline hover:outline-1 hover:outline-white">{item}</a>
        ))}
      </div>
      {open ? (
        <>
          <div className="fixed inset-0 top-[99px] z-10 bg-[rgb(0_0_0_/_0.5)]" onClick={() => setOpen(false)} aria-hidden />
          <div id="all-flyout" className="absolute left-0 top-full z-20 max-h-[70vh] w-[365px] overflow-y-auto bg-white py-2 text-ink shadow-dropdown">
            <p className="px-4 py-2 text-[18px] font-bold">Shop by Department</p>
            <ul>
              {departments.map((d) => (
                <li key={d}><a href="/s" className="block px-4 py-2 text-[14px] hover:bg-surface-2">{d}</a></li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </nav>
  );
}

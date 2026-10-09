'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '../lib/cn';

export type ShortcutAction = 'search' | 'cart' | 'home' | 'orders' | 'toggle';

/** Amazon's keyboard shortcuts: alt + / for search, shift + alt + a letter for the rest. */
const SHIFTED: Record<string, ShortcutAction> = { KeyC: 'cart', KeyH: 'home', KeyO: 'orders', KeyZ: 'toggle' };

/**
 * The shortcut a key press means, if any. Reads `code` (the key's place on the keyboard), since
 * on a Mac option turns `key` into another character ("÷" for option + /).
 */
export function shortcutFor(e: Pick<KeyboardEvent, 'code' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>): ShortcutAction | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  if (!e.shiftKey) return e.code === 'Slash' ? 'search' : null;
  return SHIFTED[e.code] ?? null;
}

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(t.type)));

/** The header's search box on show (desktop and phone each have one). */
function focusSearch() {
  const boxes = [...document.querySelectorAll<HTMLInputElement>('header input[name="k"]')];
  (boxes.find((b) => b.getClientRects().length > 0) ?? boxes[0])?.focus();
}

/**
 * Amazon's "Skip to" box: the first thing Tab reaches, listing the keyboard shortcuts under a link
 * to the main content. shift + alt + Z keeps it open (or closes it); Escape closes it too. The
 * shortcuts work anywhere but in a text field.
 */
export function SkipMenu({ homeHref, cartHref, ordersHref }: { homeHref: string; cartHref: string; ordersHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [alt, setAlt] = useState('alt');

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setAlt('opt');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        return;
      }
      const action = shortcutFor(e);
      if (!action || editable(e.target)) return;
      e.preventDefault();
      if (action === 'toggle') setOpen((o) => !o);
      else if (action === 'search') focusSearch();
      else router.push(action === 'cart' ? cartHref : action === 'orders' ? ordersHref : homeHref);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, router, homeHref, cartHref, ordersHref]);

  const keys = (...k: string[]) => (
    <span className="flex flex-none items-center gap-1 text-[12px] text-ink-3">
      {k.map((x, i) => (
        <span key={x} className="flex items-center gap-1">
          {i ? '+' : null}
          <kbd className="rounded-[4px] border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[12px] text-ink">{x}</kbd>
        </span>
      ))}
    </span>
  );
  const rows: [string, ReactNode][] = [
    ['Search', keys(alt, '/')],
    ['Cart', keys('shift', alt, 'C')],
    ['Home', keys('shift', alt, 'H')],
    ['Orders', keys('shift', alt, 'O')],
    ['Show/Hide shortcuts', keys('shift', alt, 'Z')],
  ];

  return (
    <nav
      aria-label="Skip to"
      data-open={open || undefined}
      className={cn(
        'z-[90] w-[min(300px,calc(100vw-32px))] rounded-card border border-line bg-surface p-4 text-ink shadow-lg',
        open ? 'fixed left-4 top-3' : 'sr-only focus-within:not-sr-only focus-within:fixed focus-within:left-4 focus-within:top-3',
      )}
    >
      <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">Skip to</p>
      <a href="#main" className="mt-1 block text-[15px] font-semibold text-ink underline underline-offset-2" onClick={() => setOpen(false)}>
        Main content
      </a>
      <p className="m-0 mt-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">Keyboard shortcuts</p>
      <dl className="m-0 mt-1.5 flex flex-col gap-1.5 text-[14px]">
        {rows.map(([label, combo]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt>{label}</dt>
            <dd className="m-0">{combo}</dd>
          </div>
        ))}
      </dl>
    </nav>
  );
}

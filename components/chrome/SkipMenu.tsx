'use client';

import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '../lib/cn';

export type ShortcutAction = 'search' | 'cart' | 'home' | 'orders' | 'addToCart' | 'summary' | 'toggle';

/** A part of the page the box can jump to (a product page lists its own). */
export interface SkipLink { label: string; href: string }

/** Amazon's keyboard shortcuts: alt + / for search, shift + alt + a letter for the rest. */
const SHIFTED: Record<string, ShortcutAction> = { KeyC: 'cart', KeyH: 'home', KeyO: 'orders', KeyK: 'addToCart', KeyD: 'summary', KeyZ: 'toggle' };

/**
 * The shortcut a key press means, if any. Reads `code` (the key's place on the keyboard), since
 * on a Mac option turns `key` into another character ("÷" for option + /); `key` only when an
 * input method leaves `code` empty.
 */
export function shortcutFor(e: Pick<KeyboardEvent, 'code' | 'key' | 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'>): ShortcutAction | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  const code = e.code || (e.key === '/' ? 'Slash' : /^[a-z]$/i.test(e.key) ? `Key${e.key.toUpperCase()}` : '');
  if (!e.shiftKey) return code === 'Slash' ? 'search' : null;
  return SHIFTED[code] ?? null;
}

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(t.type)));

/** The header's search box on show (desktop and phone each have one). */
function focusSearch() {
  const boxes = [...document.querySelectorAll<HTMLInputElement>('header input[name="k"]')];
  (boxes.find((b) => b.getClientRects().length > 0) ?? boxes[0])?.focus();
}

/** A button the page marks for a shortcut (a product page's Add to Cart or summary), pressed as if by hand. */
function press(name: 'add-to-cart' | 'product-summary') {
  document.querySelector<HTMLButtonElement>(`[data-shortcut="${name}"]:not(:disabled)`)?.click();
}

/** Up and down arrows step between the box's links (as on Amazon), stopping at either end. */
function stepLinks(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const links = [...e.currentTarget.querySelectorAll<HTMLAnchorElement>('a[href]')];
  const at = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (at < 0) return;
  e.preventDefault();
  links[Math.max(0, Math.min(links.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
}

/** Opens the folded section a skip link lands in (say, a closed spec group) so its content shows. */
function unfold(href: string) {
  if (!href.startsWith('#')) return;
  const box = document.getElementById(decodeURIComponent(href.slice(1)))?.closest('details');
  if (box) box.open = true;
}

/**
 * Amazon's "Skip to" box: the first thing Tab reaches, listing the keyboard shortcuts under links
 * to the main content and to the page's own parts (`links`). shift + alt + Z keeps it open (or
 * closes it); Escape closes it too. The shortcuts work anywhere but in a text field; shift + alt + K
 * (Add to cart) and shift + alt + D (Product summary) only where the page says it has one.
 */
export function SkipMenu({ homeHref, cartHref, ordersHref, links = [], addToCart = false, summary = false }: { homeHref: string; cartHref: string; ordersHref: string; links?: SkipLink[]; addToCart?: boolean; summary?: boolean }) {
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
      if (!action || editable(e.target) || (action === 'addToCart' && !addToCart) || (action === 'summary' && !summary)) return;
      e.preventDefault();
      if (action === 'toggle') setOpen((o) => !o);
      else if (action === 'search') focusSearch();
      else if (action === 'addToCart') press('add-to-cart');
      else if (action === 'summary') press('product-summary');
      else router.push(action === 'cart' ? cartHref : action === 'orders' ? ordersHref : homeHref);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, router, homeHref, cartHref, ordersHref, addToCart, summary]);

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
    ...(addToCart ? [['Add to cart', keys('shift', alt, 'K')] as [string, ReactNode]] : []),
    ...(summary ? [['Product summary', keys('shift', alt, 'D')] as [string, ReactNode]] : []),
    ['Show/Hide shortcuts', keys('shift', alt, 'Z')],
  ];
  const jump = 'mt-1 block text-[15px] font-semibold text-ink underline underline-offset-2';

  return (
    <nav
      aria-label="Skip to"
      onKeyDown={stepLinks}
      data-open={open || undefined}
      className={cn(
        'z-[90] w-[min(320px,calc(100vw-32px))] rounded-card border border-line bg-surface p-4 text-ink shadow-lg',
        // not-sr-only resets the width, so focus sets it again
        open ? 'fixed left-4 top-3' : 'sr-only focus-within:not-sr-only focus-within:fixed focus-within:left-4 focus-within:top-3 focus-within:w-[min(320px,calc(100vw-32px))]',
      )}
    >
      <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">Skip to</p>
      <a href="#main" className={jump} onClick={() => setOpen(false)}>
        Main content
      </a>
      {links.map((l) => (
        <a key={l.href} href={l.href} className={jump} onClick={() => { unfold(l.href); setOpen(false); }}>
          {l.label}
        </a>
      ))}
      <p className="m-0 mt-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">Keyboard shortcuts</p>
      <dl className="m-0 mt-1.5 flex flex-col gap-1.5 text-[14px]">
        {rows.map(([label, combo]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt>{label}</dt>
            <dd className="m-0">{combo}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 mt-3 text-[12px] text-ink-3">To move between items, use your keyboard’s up or down arrows.</p>
    </nav>
  );
}

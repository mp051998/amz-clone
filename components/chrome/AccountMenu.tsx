'use client';
import { useEffect, useRef, useState } from 'react';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { signOut } from '@/app/actions/auth';
import { buttonClasses } from '../primitives/Button';

const SIGNED_IN_LINKS = [
  { label: 'Collections', href: '/collections' },
  { label: 'Orders', href: '/orders' },
  { label: 'Buy again', href: '/orders/buy-again' },
  { label: 'Account', href: '/account' },
  { label: 'Addresses', href: '/account/addresses' },
];

/**
 * "Hello, Monish / Account & Collections" (design.md §5 Header). The trigger is a real link
 * (→ /collections, or /signin when signed out); on hover/focus a small menu adds Orders, Account
 * and Sign out.
 */
export function AccountMenu({ store, userName, isAdmin = false }: { store: Store; userName?: string; isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const to = (href: string) => storePath(store, href);

  const openNow = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
  const closeSoon = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 140); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none" onMouseEnter={openNow} onMouseLeave={closeSoon} onFocus={openNow} onBlur={closeSoon}>
      <a
        href={to(userName ? '/collections' : '/signin')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="block rounded-chip p-1 leading-[1.25] text-ink no-underline hover:bg-surface-2 hover:text-ink"
      >
        <span className="block text-[12px] text-ink-3">{userName ? `Hello, ${userName}` : 'Hello, sign in'}</span>
        <span className="block text-[14px] font-semibold">Account &amp; Collections</span>
      </a>
      {open ? (
        <div className="absolute right-0 top-full z-[55] pt-2">
          <div className="w-[260px] rounded-card border border-line bg-surface p-3 shadow-pop">
            {userName ? (
              <>
                <ul className="m-0 list-none p-0">
                  {(isAdmin ? [...SIGNED_IN_LINKS, { label: 'Admin · Catalogue', href: '/admin/products' }] : SIGNED_IN_LINKS).map((l) => (
                    <li key={l.href}>
                      <a href={to(l.href)} className="flex min-h-10 items-center rounded-input px-2 text-[14px] text-ink no-underline hover:bg-surface-2 hover:text-ink">{l.label}</a>
                    </li>
                  ))}
                </ul>
                <form action={signOut} className="mt-2 border-t border-line-2 pt-2">
                  <button type="submit" className="flex min-h-10 w-full items-center rounded-input px-2 text-left text-[14px] text-ink-2 hover:bg-surface-2">Sign out</button>
                </form>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <a href={to('/signin')} className={buttonClasses({ variant: 'primary', size: 'md', block: true })}>Sign in</a>
                <p className="m-0 text-center text-[13px] text-ink-3">
                  New here? <a href={to('/signin?new=1')} className="text-ink underline underline-offset-2">Create an account</a>
                </p>
                <p className="m-0 border-t border-line-2 pt-2 text-[13px] text-ink-3">Sign in to save products into collections and track their prices.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

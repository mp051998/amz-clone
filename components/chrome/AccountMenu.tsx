'use client';
import { useEffect, useRef, useState } from 'react';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { signOut } from '@/app/actions/auth';

interface Link { label: string; href: string }

const YOUR_LISTS: Link[] = [
  { label: 'Create a List', href: '#' },
  { label: 'Find a List or Registry', href: '/registry' },
];

const YOUR_ACCOUNT: Link[] = [
  { label: 'Account', href: '/account' },
  { label: 'Orders', href: '/orders' },
  { label: 'Recommendations', href: '#' },
  { label: 'Browsing History', href: '#' },
  { label: 'Your Shopping preferences', href: '#' },
  { label: 'Watchlist', href: '/prime-video' },
  { label: 'Video Purchases & Rentals', href: '/prime-video' },
  { label: 'Kindle Unlimited', href: '#' },
  { label: 'Content & Devices', href: '#' },
  { label: 'Subscribe & Save Items', href: '#' },
  { label: 'Memberships & Subscriptions', href: '/prime' },
  { label: 'Music Library', href: '#' },
];

/** Account & Lists flyout — mirrors amazon.com's hover/click menu: Sign in CTA (or Sign out
 *  when signed in), then "Your Lists" + "Your Account" columns. Store-aware links. */
export function AccountMenu({ store, userName }: { store: Store; userName?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const to = (href: string) => (href.startsWith('/') ? storePath(store, href) : href);
  const accountHref = storePath(store, userName ? '/account' : '/signin');

  // hover with a small close delay so moving between trigger and panel doesn't flicker shut.
  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <a
        href={accountHref}
        aria-haspopup="menu"
        aria-expanded={open}
        className="block rounded-[3px] px-1.5 py-1 leading-[14px] hover:outline hover:outline-1 hover:outline-white sm:px-2"
      >
        <span className="hidden text-[12px] sm:block">{userName ? `Hello, ${userName}` : 'Hello, sign in'}</span>
        <div className="flex items-center gap-0.5 text-[13px] font-bold sm:text-[14px]">
          <span className="md:hidden">{userName ? 'Account' : 'Sign in'}</span>
          <span className="hidden md:inline">Account &amp; Lists</span>
          <span aria-hidden className="hidden text-[10px] text-[#ccc] md:inline">▾</span>
        </div>
      </a>

      {open ? (
        <div className="absolute right-0 top-full z-50 hidden pt-3 md:block">
          <div className="relative w-[480px] rounded-[7px] border border-line bg-white p-5 text-ink shadow-dropdown">
            {/* caret pointing up at the trigger */}
            <span aria-hidden className="absolute -top-[7px] right-[52px] h-3 w-3 rotate-45 border-l border-t border-line bg-white" />

            {userName ? (
              <div className="flex flex-col items-center gap-2 pb-2">
                <p className="text-[13px] text-ink-2">Hello, <b className="text-ink">{userName}</b></p>
                <form action={signOut}>
                  <button type="submit" className="h-[33px] rounded-pill bg-cta-yellow px-10 text-[13px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">
                    Sign Out
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 pb-2">
                <a href={storePath(store, '/signin')} className="flex h-[33px] w-[220px] items-center justify-center rounded-pill bg-cta-yellow text-[13px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">
                  Sign in
                </a>
                <p className="text-[12px] text-ink-2">
                  New customer? <a href={storePath(store, '/signin?new=1')} className="text-link-teal hover:text-brand-count hover:underline">Start here.</a>
                </p>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-5 border-t border-line pt-4">
              <div>
                <h3 className="mb-2 text-[15px] font-bold text-ink">Your Lists</h3>
                <ul className="space-y-2">
                  {YOUR_LISTS.map((l) => (
                    <li key={l.label}>
                      <a href={to(l.href)} className="text-[13px] text-ink-2 hover:text-link-hover hover:underline">{l.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-l border-line pl-5">
                <h3 className="mb-2 text-[15px] font-bold text-ink">Your Account</h3>
                <ul className="space-y-2">
                  {YOUR_ACCOUNT.map((l) => (
                    <li key={l.label}>
                      <a href={to(l.href)} className="text-[13px] text-ink-2 hover:text-link-hover hover:underline">{l.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

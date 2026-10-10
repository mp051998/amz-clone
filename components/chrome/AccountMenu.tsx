'use client';
import { useEffect, useRef, useState } from 'react';
import type { Store } from '../lib/store';
import { signInPath, storePath } from '@/lib/marketplace';
import { signOut } from '@/app/actions/auth';
import { buttonClasses } from '../primitives/Button';
import { SubmitButton } from '@/components/primitives/SubmitButton';

/** Amazon's "Account & Lists" flyout columns: the shopper's lists, then their account. */
const LIST_LINKS = [
  { label: 'Collections', href: '/collections' },
  { label: 'Registry & gift lists', href: '/registry' },
];

const ACCOUNT_LINKS = [
  { label: 'Account', href: '/account' },
  { label: 'Orders', href: '/orders' },
  { label: 'Buy again', href: '/orders/buy-again' },
  { label: 'Your messages', href: '/account/messages' },
  { label: 'Your reviews', href: '/account/reviews' },
  { label: 'Browsing history', href: '/history' },
  { label: 'Your recommendations', href: '/recommendations' },
  { label: 'Subscribe & Save items', href: '/subscribe-save' },
  { label: 'Plus membership', href: '/prime' },
  { label: 'Gift cards', href: '/gift-cards' },
  { label: 'Addresses', href: '/account/addresses' },
];

/**
 * "Hello, Monish / Account & Collections" (design.md §5 Header). The trigger is a real link
 * (→ /collections, or sign-in when signed out); on hover/focus a menu opens with Amazon's two
 * columns, Your Lists and Your Account — signed out too, under Sign in — and Sign out. The sign-in
 * links come back to the page being viewed.
 */
export function AccountMenu({
  store,
  userName,
  isAdmin = false,
  signInHref = signInPath(store),
  createAccountHref = signInPath(store, null, { create: true }),
}: {
  store: Store;
  userName?: string;
  isAdmin?: boolean;
  signInHref?: string;
  createAccountHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const to = (href: string) => storePath(store, href);

  const openNow = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
  const closeSoon = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 140); };
  const columns = (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-3 gap-y-2">
      {[
        { title: 'Your Lists', links: LIST_LINKS },
        { title: 'Your Account', links: userName && isAdmin ? [...ACCOUNT_LINKS, { label: 'Admin · Overview', href: '/admin' }] : ACCOUNT_LINKS },
      ].map((c) => (
        <nav key={c.title} aria-label={c.title}>
          <span className="block px-2 pb-1 text-[15px] font-semibold">{c.title}</span>
          <ul className="m-0 list-none p-0">
            {c.links.map((l) => (
              <li key={l.href}>
                <a href={to(l.href)} className="flex min-h-10 items-center rounded-input px-2 text-[14px] text-ink no-underline hover:bg-surface-2 hover:text-ink">{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );

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
        href={userName ? to('/collections') : signInHref}
        aria-haspopup="menu"
        aria-expanded={open}
        className="block rounded-chip p-1 leading-[1.25] text-ink no-underline hover:bg-surface-2 hover:text-ink"
      >
        <span className="block text-[12px] text-ink-3">{userName ? `Hello, ${userName}` : 'Hello, sign in'}</span>
        <span className="block text-[14px] font-semibold">Account &amp; Collections</span>
      </a>
      {open ? (
        <div className="absolute right-0 top-full z-[55] pt-2">
          <div className="w-[min(400px,calc(100vw-32px))] rounded-card border border-line bg-surface p-3 shadow-pop">
            {userName ? (
              <>
                {columns}
                <form action={signOut} className="mt-2 border-t border-line-2 pt-2">
                  <SubmitButton bare className="flex min-h-10 w-full items-center rounded-input px-2 text-left text-[14px] text-ink-2 hover:bg-surface-2">Sign out</SubmitButton>
                </form>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <a href={signInHref} className={buttonClasses({ variant: 'primary', size: 'md', block: true })}>Sign in</a>
                <p className="m-0 text-center text-[13px] text-ink-3">
                  New here? <a href={createAccountHref} className="text-ink underline underline-offset-2">Create an account</a>
                </p>
                <p className="m-0 border-t border-line-2 pt-2 text-[13px] text-ink-3">Sign in to save products into collections and track their prices.</p>
                {columns}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

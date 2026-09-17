'use client';
import { useEffect, useState } from 'react';
import type { Store } from '../lib/store';
import { storePath } from '@/lib/marketplace';
import { signOut } from '@/app/actions/auth';
import { IconMenu, IconClose, IconUser } from '../icons/index';

export interface NavLink { label: string; href: string }

export interface MobileNavProps {
  store: Store;
  userName?: string;
  /** shop-by-department links (label + resolved href). */
  departments: NavLink[];
  /** "Programs & Features" links — the sub-nav items (Today's Deals, Prime Video, …). */
  programs: NavLink[];
}

const HELP_LINKS: NavLink[] = [
  { label: 'Your Account', href: '/account' },
  { label: 'Your Orders', href: '/orders' },
  { label: 'Customer Service', href: '/customer-service' },
];

/** Section with a bold heading and a list of links, divided from its neighbours —
 *  mirrors the grouped rows of amazon's mobile hamburger drawer. */
function Section({ title, links, onNavigate }: { title: string; links: NavLink[]; onNavigate: () => void }) {
  if (!links.length) return null;
  return (
    <div className="border-t border-line py-2.5">
      <p className="px-5 py-1.5 text-[16px] font-bold text-ink">{title}</p>
      <ul>
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} onClick={onNavigate} className="block px-5 py-2 text-[14px] text-ink-2 hover:bg-surface-2">{l.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mobile hamburger + left slide-in drawer — the signature amazon.com mobile menu.
 *  Hidden on md+, where the sub-nav "All" flyout handles departments instead. The
 *  drawer opens from a dark greeting header, then Shop by Department / Programs &
 *  Features / Help & Settings sections. */
export function MobileNav({ store, userName, departments, programs }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const to = (href: string) => (href.startsWith('/') ? storePath(store, href) : href);
  const close = () => setOpen(false);

  // lock body scroll while the drawer is open, and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const helpLinks = HELP_LINKS.map((l) => ({ ...l, href: to(l.href) }));

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-drawer"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center rounded-[3px] px-1.5 py-2 hover:outline hover:outline-1 hover:outline-white"
      >
        <IconMenu width={22} height={22} />
      </button>

      {/* overlay + drawer: kept mounted so the slide transition can play both ways */}
      <div id="mobile-drawer" role="dialog" aria-modal="true" aria-hidden={!open} className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`}>
        <div
          onClick={close}
          aria-hidden
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          className={`absolute left-0 top-0 flex h-full w-[85%] max-w-[365px] flex-col bg-white text-ink shadow-[2px_0_16px_rgba(0,0,0,0.35)] transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {/* greeting header — links to sign-in / account */}
          <a href={to(userName ? '/account' : '/signin')} onClick={close} className="flex items-center gap-3 bg-nav-belt px-5 py-4 text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
              <IconUser width={18} height={18} />
            </span>
            <span className="text-[17px] font-bold">{userName ? `Hello, ${userName}` : 'Hello, sign in'}</span>
          </a>

          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
            {/* departments/programs arrive already store-resolved from AppShell — do not re-prefix */}
            <Section title="Shop by Department" links={departments} onNavigate={close} />
            <Section title="Programs & Features" links={programs} onNavigate={close} />
            <Section title="Help & Settings" links={helpLinks} onNavigate={close} />
            {userName ? (
              <div className="border-t border-line py-2.5">
                <form action={signOut}>
                  <button type="submit" className="block w-full px-5 py-2 text-left text-[14px] text-ink-2 hover:bg-surface-2">Sign Out</button>
                </form>
              </div>
            ) : null}
          </div>
        </div>

        {/* close affordance, echoing amazon's X tab beside the open drawer */}
        <button
          type="button"
          aria-label="Close menu"
          onClick={close}
          className={`absolute left-[85%] top-3 ml-2 max-[430px]:left-auto max-[430px]:right-3 text-white transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        >
          <IconClose width={26} height={26} />
        </button>
      </div>
    </div>
  );
}

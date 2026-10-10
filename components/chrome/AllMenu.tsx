'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { signOut } from '@/app/actions/auth';
import { SubmitButton } from '@/components/primitives/SubmitButton';

export interface AllMenuLink { label: string; href: string }
export interface AllMenuSection { heading: string; links: AllMenuLink[] }
export interface AllMenuProps {
  /** "Hello, Asha" or "Hello, sign in" */
  greeting: string;
  /** the account page, or sign in */
  greetingHref: string;
  sections: AllMenuSection[];
  /** signed in: "Sign out" ends the menu, as on Amazon */
  signedIn?: boolean;
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function MenuIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </svg>
  );
}

/**
 * "All" at the start of the category strip: a side panel with every department, the store's
 * programs and the account and help links in one place (Amazon's hamburger menu). Modal: focus
 * stays inside, Escape or the backdrop closes it and focus goes back to "All".
 */
export function AllMenu({ greeting, greetingHref, sections, signedIn = false }: AllMenuProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const id = useId();

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const dialog = (
    <div className="fixed inset-0 z-[85] flex" onKeyDown={onKeyDown}>
      <div aria-hidden className="absolute inset-0 bg-ink/50" onClick={close} data-testid="all-menu-backdrop" />
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Shop by department, programs and help"
        className="relative flex h-full w-[min(365px,86vw)] flex-col overflow-y-auto bg-surface text-ink shadow-hero"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-ink px-4 py-3 text-on-ink">
          <a href={greetingHref} className="min-h-10 content-center text-[17px] font-semibold text-on-ink no-underline hover:text-on-ink hover:underline">
            {greeting}
          </a>
          <button
            ref={closeBtn}
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[22px] leading-none text-on-ink hover:bg-on-ink/10"
          >
            ×
          </button>
        </div>
        {sections.map((s) =>
          s.links.length ? (
            <nav key={s.heading} aria-label={s.heading} className="border-b border-line-2 px-2 py-3 last:border-b-0">
              <h2 className="m-0 px-2 pb-1.5 text-[16px] font-semibold">{s.heading}</h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {s.links.map((l) => (
                  <li key={l.href + l.label}>
                    <a
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-11 items-center rounded-input px-2 text-[15px] text-ink-2 no-underline hover:bg-surface-2 hover:text-ink"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null,
        )}
        {signedIn ? (
          <form action={signOut} className="border-t border-line-2 px-2 py-3">
            <SubmitButton bare className="flex min-h-11 w-full items-center rounded-input px-2 text-left text-[15px] text-ink-2 hover:bg-surface-2 hover:text-ink">
              Sign out
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="flex min-h-10 items-center gap-1.5 rounded-chip px-3 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-2"
      >
        <MenuIcon />
        All
      </button>
      {open ? createPortal(dialog, document.body) : null}
    </>
  );
}

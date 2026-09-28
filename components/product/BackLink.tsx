'use client';
import type { MouseEvent } from 'react';

/** "← Back": history back when we came from this site, else the store's search page. */
export function BackLink({ fallbackHref }: { fallbackHref: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    let sameSite = false;
    try { sameSite = !!document.referrer && new URL(document.referrer).origin === window.location.origin; } catch { /* bad referrer */ }
    if (sameSite && window.history.length > 1) {
      e.preventDefault();
      window.history.back();
    }
  };
  return (
    <a href={fallbackHref} onClick={onClick} className="inline-flex min-h-11 items-center self-start text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink">
      ← Back
    </a>
  );
}

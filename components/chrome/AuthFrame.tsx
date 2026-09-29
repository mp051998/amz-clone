import type { ReactNode } from 'react';
import { Wordmark } from './Wordmark';

/** The bare sign-in layout: wordmark home link, a narrow column, the demo disclaimer. */
export function AuthFrame({ homeHref, children }: { homeHref: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-bg px-4 pt-10">
      <a href={homeHref} aria-label="Store home" className="mb-6 no-underline"><Wordmark /></a>
      <main id="main" className="flex w-full max-w-[400px] flex-col gap-4">{children}</main>
      <footer className="mt-12 py-6 text-center text-[12px] text-ink-3">
        Unofficial demo store — not affiliated with any real retailer. No real orders or payments.
      </footer>
    </div>
  );
}

/** The white card most auth screens sit in. */
export function AuthCard({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">{title}</h1>
        {lead ? <span className="text-[14px] text-ink-2">{lead}</span> : null}
      </div>
      {children}
    </div>
  );
}

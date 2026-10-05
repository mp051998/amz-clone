'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Page, PageHead } from '../brand/Page';
import { buttonClasses } from '../primitives/Button';
import { Wordmark } from './Wordmark';

/** '/in' and '/in/…' are the India store; everything else is the US store. */
function storePrefix(pathname: string | null): string {
  return pathname === '/in' || pathname?.startsWith('/in/') ? '/in' : '';
}

/**
 * What a page shows when it fails to render (app/error.tsx, app/global-error.tsx): a plain header
 * with the store mark (the full header needs the same data that may have failed), what happened,
 * Try again, and ways out. The digest matches the server log line for the error.
 */
export function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const prefix = storePrefix(usePathname());
  const href = (p: string) => (p === '/' ? prefix || '/' : `${prefix}${p}`);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <header className="border-b border-line bg-surface px-[clamp(16px,3vw,24px)] py-3">
        <a href={href('/')} aria-label="Store home" className="no-underline">
          <Wordmark />
        </a>
      </header>
      <main>
        <Page className="min-h-[50vh]">
          <PageHead
            kicker="Something went wrong"
            title="This page didn't load"
            actions={
              <>
                <button type="button" onClick={() => retry()} className={buttonClasses({ variant: 'primary' })}>
                  Try again
                </button>
                <a href={href('/')} className={buttonClasses({ variant: 'secondary' })}>Back to the store</a>
                <a href={href('/customer-service')} className={buttonClasses({ variant: 'secondary' })}>Get help</a>
              </>
            }
          >
            <p className="m-0">
              The problem is on our side, not yours. It&apos;s usually brief, so try again in a moment. Your cart and orders are safe.
            </p>
            {error.digest ? (
              <p className="m-0 mt-2 text-[13px] text-ink-3">
                Reference: <span className="font-mono">{error.digest}</span>
              </p>
            ) : null}
          </PageHead>
        </Page>
      </main>
    </div>
  );
}

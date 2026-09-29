import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision/Badges';
import { PageHead, pageX } from '@/components/brand/Page';
import type { PublicMarketplace } from '@/lib/contracts';
import { storePath } from '@/lib/marketplace';
import { cn } from '@/components/lib/cn';

const STORE_LABEL = { US: 'United States store', IN: 'India store' } as const;

/** Admin page chrome: storefront shell, "Admin · <store>" kicker, title, and a store switch. */
export function AdminFrame({ store, title, actions, lede, children, path }: {
  store: PublicMarketplace;
  title: string;
  actions?: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  /** base path of this page, for the link to the same page in the other store. */
  path: string;
}) {
  const other = store.id === 'IN' ? 'US' : 'IN';
  return (
    <AppShell>
      <div className={cn(pageX, 'flex flex-col gap-6 pb-16 pt-7')}>
        <PageHead
          kicker={
            <>
              Admin · {STORE_LABEL[store.id]} ·{' '}
              <a href={storePath({ id: other }, path)} className="text-ink underline underline-offset-2">Switch to {STORE_LABEL[other]}</a>
            </>
          }
          title={title}
          actions={actions}
        >
          {lede}
        </PageHead>
        {children}
      </div>
    </AppShell>
  );
}

/** Signed in, but not an admin. */
export function AdminOnly({ store }: { store: PublicMarketplace }) {
  return (
    <AppShell>
      <div className={cn(pageX, 'pb-16 pt-10')}>
        <EmptyState
          title="This area is for store admins."
          action={<a href={storePath(store, '/')} className="text-[15px] underline underline-offset-2">Back to the store</a>}
        >
          Your account doesn’t have admin access. Ask an existing admin to add you.
        </EmptyState>
      </div>
    </AppShell>
  );
}

/** Minor units → the text an admin types (19.99; whole amounts without decimals). */
export function majorText(minor: number | null | undefined): string {
  if (minor == null) return '';
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

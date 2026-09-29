import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/decision/Badges';
import { Pill } from '@/components/decision/Pill';
import { PageHead, pageX } from '@/components/brand/Page';
import type { PublicMarketplace } from '@/lib/contracts';
import { storePath } from '@/lib/marketplace';
import { cn } from '@/components/lib/cn';

const STORE_LABEL = { US: 'United States store', IN: 'India store' } as const;

const SECTIONS = [
  { path: '/admin/products', label: 'Products' },
  { path: '/admin/categories', label: 'Categories' },
] as const;

/** Admin page chrome: storefront shell, section tabs, "Admin · <store>" kicker, title, and a store switch. */
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
      <div className={cn(pageX, 'flex flex-col gap-6 pb-16 pt-5')}>
        <nav aria-label="Admin" className="flex gap-5 border-b border-line text-[15px]">
          {SECTIONS.map((sec) => {
            const current = path.startsWith(sec.path);
            return (
              <a
                key={sec.path}
                href={storePath(store, sec.path)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px flex min-h-11 items-center border-b-2 no-underline',
                  current ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink',
                )}
              >
                {sec.label}
              </a>
            );
          })}
        </nav>
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

/** Pill tabs that filter the page (e.g. On sale / Archived). */
export function AdminTabs({ label, tabs }: { label: string; tabs: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map((t) => <Pill key={t.href} href={t.href} selected={t.current}>{t.label}</Pill>)}
    </nav>
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

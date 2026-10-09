import { cn } from '../lib/cn';

export type PaymentsTab = 'wallet' | 'transactions';

const TABS: { key: PaymentsTab; path: string; label: string }[] = [
  { key: 'wallet', path: '/account/payments', label: 'Wallet' },
  { key: 'transactions', path: '/account/transactions', label: 'Transactions' },
];

/**
 * "Wallet | Transactions" atop Your Payments and Your transactions, as on Amazon's Your Payments.
 * `href` puts a path in the current store.
 */
export function PaymentsTabs({ current, href }: { current: PaymentsTab; href: (path: string) => string }) {
  return (
    <nav aria-label="Your Payments" className="flex max-w-full gap-5 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {TABS.map((t) => (
        <a
          key={t.key}
          href={href(t.path)}
          aria-current={current === t.key ? 'page' : undefined}
          className={cn(
            '-mb-px flex-none whitespace-nowrap border-b-2 px-1 pb-2 text-[15px] no-underline',
            current === t.key ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink',
          )}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}

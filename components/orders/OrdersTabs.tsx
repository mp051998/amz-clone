import { cn } from '../lib/cn';

export type OrdersTab = 'orders' | 'buy-again' | 'not-shipped' | 'cancelled';

const TABS: { key: OrdersTab; path: string; label: string }[] = [
  { key: 'orders', path: '/orders', label: 'Orders' },
  { key: 'buy-again', path: '/orders/buy-again', label: 'Buy again' },
  { key: 'not-shipped', path: '/orders?view=not-shipped', label: 'Not yet shipped' },
  { key: 'cancelled', path: '/orders?view=cancelled', label: 'Cancelled orders' },
];

/**
 * "Orders | Buy again | Not yet shipped | Cancelled orders" above Your Orders. `href` puts a
 * path in the current store. Scrolls sideways on a narrow phone rather than wrapping.
 */
export function OrdersTabs({ current, href }: { current: OrdersTab; href: (path: string) => string }) {
  return (
    <nav aria-label="Orders" className="flex max-w-full gap-5 overflow-x-auto border-b border-line [scrollbar-width:none]">
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

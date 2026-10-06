import { cn } from '../lib/cn';

/** "Orders | Buy again" above both pages. */
export function OrdersTabs({ current, ordersHref, buyAgainHref }: { current: 'orders' | 'buy-again'; ordersHref: string; buyAgainHref: string }) {
  const tab = (key: typeof current, href: string, label: string) => (
    <a
      href={href}
      aria-current={current === key ? 'page' : undefined}
      className={cn(
        '-mb-px border-b-2 px-1 pb-2 text-[15px] no-underline',
        current === key ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink',
      )}
    >
      {label}
    </a>
  );
  return (
    <nav aria-label="Orders" className="flex gap-5 border-b border-line">
      {tab('orders', ordersHref, 'Orders')}
      {tab('buy-again', buyAgainHref, 'Buy again')}
    </nav>
  );
}

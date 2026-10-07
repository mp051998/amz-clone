import type { Metadata } from 'next';
import { adminSales, averageOrderMinor, salesPeriod, SALES_PERIODS } from '@/lib/data/admin-sales';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';

export const metadata: Metadata = { title: 'Sales · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;

/**
 * /admin/sales (and /in/admin/sales): how the store is selling, as Amazon's Business Reports
 * show it: over the last 7, 30 or 90 days, ordered product sales, orders and units with the
 * average order, cancellations and returns; sales day by day; and the best sellers.
 */
export default async function AdminSalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/sales');
  if (!admin) return <AdminOnly store={store} />;

  const days = salesPeriod(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const r = await adminSales(await db(), store.id, days);
  const to = (path: string) => storePath(store, path);
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const n = (v: number) => v.toLocaleString(store.locale.default);
  // days are the store's calendar days: format them as dates, not instants
  const dayLabel = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtDay = (d: string) => dayLabel.format(new Date(`${d}T00:00:00Z`));
  const peak = Math.max(1, ...r.byDay.map((d) => d.salesMinor));

  const tiles = [
    { label: 'Ordered product sales', value: money(r.totals.salesMinor), note: 'What the items sold for after coupons, before tax and delivery.' },
    { label: 'Orders', value: n(r.totals.orders), note: `Average order ${money(averageOrderMinor(r))}.` },
    { label: 'Units ordered', value: n(r.totals.units), note: r.totals.orders ? `${(r.totals.units / r.totals.orders).toFixed(1)} per order.` : 'Nothing ordered yet.' },
    { label: 'Cancelled orders', value: n(r.totals.cancelledOrders), note: 'Placed in these days, cancelled since. Not counted above.' },
    { label: 'Returns received', value: n(r.totals.returns), note: `${n(r.totals.unitsReturned)} ${r.totals.unitsReturned === 1 ? 'unit' : 'units'} back, ${money(r.totals.refundedMinor)} refunded.` },
  ];

  return (
    <AdminFrame
      store={store}
      path="/admin/sales"
      title="Sales"
      lede={<>Orders placed in this store from {fmtDay(r.from)} to {fmtDay(r.to)} (its own days, {r.timeZone}). Orders cancelled since, and items cancelled from an order, don’t count.</>}
    >
      <AdminTabs
        label="Sales period"
        tabs={SALES_PERIODS.map((d) => ({ href: to(`/admin/sales${d === 30 ? '' : `?days=${d}`}`), label: `Last ${d} days`, current: d === days }))}
      />

      <ul aria-label="Totals" className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-3 p-0">
        {tiles.map((t) => (
          <li key={t.label} className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
            <span className="text-[14px] text-ink-2">{t.label}</span>
            <strong className="text-[24px] font-semibold tabular-nums">{t.value}</strong>
            <span className="text-[13px] text-ink-3">{t.note}</span>
          </li>
        ))}
      </ul>

      <section aria-labelledby="sales-by-day" className="flex flex-col gap-3">
        <h2 id="sales-by-day" className="m-0 text-[18px] font-semibold">Sales by day</h2>
        <div aria-hidden className="flex h-[140px] items-end gap-px rounded-card border border-line bg-surface p-3">
          {r.byDay.map((d) => (
            <span
              key={d.day}
              title={`${fmtDay(d.day)}: ${money(d.salesMinor)}`}
              className="min-w-0 flex-1 rounded-t-[2px] bg-ink"
              style={{ height: `${d.salesMinor ? Math.max(2, Math.round((d.salesMinor / peak) * 100)) : 0}%` }}
            />
          ))}
        </div>
        <details className="text-[14px]">
          <summary className="cursor-pointer text-ink underline underline-offset-2">Daily figures</summary>
          <table className="mt-2 w-full border-collapse text-left tabular-nums">
            <thead>
              <tr className="border-b border-line text-ink-2">
                <th scope="col" className="py-1.5 pr-3 font-medium">Day</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Orders</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">Units</th>
                <th scope="col" className="py-1.5 text-right font-medium">Sales</th>
              </tr>
            </thead>
            <tbody>
              {[...r.byDay].reverse().map((d) => (
                <tr key={d.day} className="border-b border-line-2">
                  <th scope="row" className="py-1.5 pr-3 font-normal">{fmtDay(d.day)}</th>
                  <td className="py-1.5 pr-3 text-right">{n(d.orders)}</td>
                  <td className="py-1.5 pr-3 text-right">{n(d.units)}</td>
                  <td className="py-1.5 text-right">{money(d.salesMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section aria-labelledby="best-sellers" className="flex flex-col gap-3">
        <h2 id="best-sellers" className="m-0 text-[18px] font-semibold">Best sellers</h2>
        {r.top.length ? (
          <ol className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
            {r.top.map((p, i) => (
              <li key={p.productId} className="flex items-center gap-3 border-t border-line-2 px-4 py-3 first:border-t-0">
                <span className="w-6 flex-none text-[14px] text-ink-3 tabular-nums">{i + 1}</span>
                {p.image ? <img src={p.image} alt="" width={40} height={40} className="h-10 w-10 flex-none rounded-[6px] object-contain" /> : null}
                <a href={to(`/product/${encodeURIComponent(p.productId)}`)} className="line-clamp-2 min-w-0 flex-1 text-[15px] text-ink underline underline-offset-2">{p.title}</a>
                <span className="flex-none text-right text-[14px] tabular-nums">
                  <span className="block font-semibold">{money(p.salesMinor)}</span>
                  <span className="block text-ink-3">{n(p.units)} {p.units === 1 ? 'unit' : 'units'} · {n(p.orders)} {p.orders === 1 ? 'order' : 'orders'}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-[15px] text-ink-2">No orders in these days yet.</p>
        )}
      </section>
    </AdminFrame>
  );
}

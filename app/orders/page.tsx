import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getProduct } from '@/lib/catalog-market';
import { readOrders } from '@/lib/orders';
import { readUser } from '@/lib/auth';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import type { CurrencyCode } from '@/lib/contracts';

export const metadata: Metadata = { title: 'Your Orders | Amazon' };

const dateStr = (ts: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(ts));

export default async function OrdersPage() {
  const store = await getMarketplace();
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/orders'));
  const sp = (path: string) => storePath(store, path);
  const money = (minor: number, cur: CurrencyCode) => formatMoney(minor, cur);
  const orders = await readOrders();

  return (
    <AppShell>
      <div className="mx-auto max-w-[1000px] px-4 py-5">
        <h1 className="mb-4 text-[28px] font-normal text-ink">Your Orders</h1>

        {orders.length === 0 ? (
          <div className="rounded-[8px] border border-line bg-white p-8 text-center">
            <p className="text-[18px] font-bold text-ink">No orders yet</p>
            <p className="mt-1 text-[14px] text-ink-2">Items you order will show up here.</p>
            <a href={sp('/')} className="mt-4 inline-flex h-[33px] items-center rounded-pill bg-cta-yellow px-5 text-[14px] text-ink hover:bg-cta-yellow-hover">Start shopping</a>
          </div>
        ) : (
          <div className="space-y-5">
            {orders.map((o) => (
              <div key={o.id} className="rounded-[8px] border border-line bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-[8px] bg-surface-2 px-5 py-3 text-[12px] text-ink-2">
                  <div><span className="block uppercase">Order placed</span><span className="text-[13px] text-ink">{dateStr(o.ts, store.locale.default)}</span></div>
                  <div><span className="block uppercase">Total</span><span className="text-[13px] text-ink">{money(o.tot, o.cur ?? 'USD')}</span></div>
                  <div><span className="block uppercase">Ship to</span><span className="text-[13px] text-ink">{o.name}</span></div>
                  <div className="text-right">
                    <span className="block uppercase">Order # {o.id}</span>
                    <a href={sp(`/orders/${o.id}`)} className="text-[13px] text-link hover:text-link-hover hover:underline">View order details</a>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                  {o.items.map((it) => {
                    const p = getProduct(it.id);
                    if (!p) return null;
                    return (
                      <a key={it.id} href={sp(`/product/${p.id}`)} className="flex items-center gap-2">
                        <span className="flex h-[56px] w-[56px] items-center justify-center bg-white">
                          <img src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" />
                        </span>
                        <span className="hidden max-w-[220px] text-[12px] text-ink sm:line-clamp-2">{p.title}</span>
                      </a>
                    );
                  })}
                  <a href={sp(`/orders/${o.id}`)} className="ml-auto inline-flex h-[31px] items-center rounded-pill border border-line bg-white px-4 text-[13px] text-ink hover:bg-surface-2">View details</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

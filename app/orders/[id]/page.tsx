import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getProduct } from '@/lib/catalog-market';
import { getOrder } from '@/lib/orders';
import { readUser } from '@/lib/auth';
import { deliveryDate } from '@/lib/dates';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';

export const metadata: Metadata = { title: 'Order details | Amazon' };

const dateStr = (ts: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(ts));

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { id } = await params;
  const { placed } = await searchParams;
  const store = await getMarketplace();
  if (!(await readUser())) redirect(storePath(store, '/signin?next=/orders'));
  const order = await getOrder(id);
  if (!order) notFound();

  const cur = order.cur ?? 'USD';
  const money = (minor: number) => formatMoney(minor, cur);
  const sp = (path: string) => storePath(store, path);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1000px] px-4 py-5">
        {placed ? (
          <div className="mb-4 flex items-start gap-3 rounded-[8px] border border-success/40 bg-[#F0F9F0] p-4">
            <span className="text-[28px] leading-none text-success-deep">✓</span>
            <div>
              <h1 className="text-[22px] font-bold text-success-deep">Order placed, thank you!</h1>
              <p className="text-[14px] text-ink">Confirmation will be sent to your email. Estimated delivery <b>{deliveryDate(3, store)}</b>.</p>
            </div>
          </div>
        ) : (
          <h1 className="mb-3 text-[24px] font-bold text-ink">Order details</h1>
        )}

        <div className="rounded-[8px] border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-[8px] bg-surface-2 px-5 py-3 text-[12px] text-ink-2">
            <div><span className="block uppercase">Order placed</span><span className="text-[13px] text-ink">{dateStr(order.ts, store.locale.default)}</span></div>
            <div><span className="block uppercase">Total</span><span className="text-[13px] text-ink">{money(order.tot)}</span></div>
            <div><span className="block uppercase">Ship to</span><span className="text-[13px] text-ink">{order.name} · {order.city} {order.zip}</span></div>
            <div className="text-right"><span className="block uppercase">Order #</span><span className="text-[13px] text-ink">{order.id}</span></div>
          </div>

          <div className="px-5 py-4">
            <p className="mb-3 text-[15px] font-bold text-success-deep">Arriving {deliveryDate(3, store)}</p>
            <div className="space-y-4">
              {order.items.map((it) => {
                const p = getProduct(it.id);
                if (!p) return null;
                return (
                  <div key={it.id} className="flex gap-4">
                    <a href={sp(`/product/${p.id}`)} className="flex h-[80px] w-[80px] shrink-0 items-center justify-center bg-white">
                      <img src={p.image} alt={p.title} className="max-h-full max-w-full object-contain" />
                    </a>
                    <div className="min-w-0 flex-1">
                      <a href={sp(`/product/${p.id}`)} className="line-clamp-2 text-[14px] text-link hover:text-link-hover hover:underline">{p.title}</a>
                      <p className="text-[12px] text-ink-2">Qty: {it.q} · Sold by {p.seller}</p>
                      <p className="text-[13px] font-bold text-price-deal">{money(it.p)}</p>
                      <a href={sp(`/product/${p.id}`)} className="mt-1 inline-flex h-[28px] items-center rounded-pill bg-cta-yellow px-3 text-[12px] text-ink hover:bg-cta-yellow-hover">Buy it again</a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-line-3 px-5 py-4">
            <dl className="ml-auto max-w-[280px] space-y-1 text-[13px] text-ink">
              <div className="flex justify-between"><dt>Item(s) Subtotal:</dt><dd>{money(order.sub)}</dd></div>
              <div className="flex justify-between"><dt>Shipping:</dt><dd>{order.ship === 0 ? 'FREE' : money(order.ship)}</dd></div>
              {order.tax > 0 ? (
                <div className="flex justify-between"><dt>Estimated tax:</dt><dd>{money(order.tax)}</dd></div>
              ) : (
                <div className="flex justify-between text-ink-2"><dt>Tax:</dt><dd>Inclusive of all taxes</dd></div>
              )}
              <div className="flex justify-between border-t border-line-3 pt-1 text-[15px] font-bold"><dt>Grand Total:</dt><dd>{money(order.tot)}</dd></div>
              <div className="pt-1 text-[12px] text-ink-2">Paid with {order.pay ?? `card ending ${order.last4}`}</div>
            </dl>
          </div>
        </div>

        <div className="mt-4 flex gap-3 text-[13px]">
          <a href={sp('/orders')} className="text-link hover:text-link-hover hover:underline">View all orders</a>
          <a href={sp('/')} className="text-link hover:text-link-hover hover:underline">Continue shopping</a>
        </div>
      </div>
    </AppShell>
  );
}

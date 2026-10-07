import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Wordmark } from '@/components/chrome/Wordmark';
import { PrintButton } from '@/components/orders/PrintButton';
import { longDate } from '@/components/orders/format';
import { firstName, readUser } from '@/lib/auth';
import { getOrder } from '@/lib/data/orders';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Gift receipt · Store' };

/**
 * Printable gift receipt for one of the shopper's placed orders: the items and quantities with no
 * prices, who it's from and the gift note, to tuck in with a present. `?item=` narrows it to one
 * item of the order. Unpaid and cancelled orders have none.
 */
export default async function GiftReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string }> }) {
  const [{ id }, { item }] = await Promise.all([params, searchParams]);
  const store = await getMarketplace();
  const self = `/orders/${encodeURIComponent(id)}/gift-receipt`;
  const user = await readUser();
  if (!user) redirect(storePath(store, `/signin?next=${encodeURIComponent(self)}`));
  const order = await getOrder(await db(), id);
  if (!order) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `/orders/${encodeURIComponent(order.id)}/gift-receipt`));
  const orderHref = storePath(store, `/orders/${encodeURIComponent(order.id)}?placed=0`);
  if (order.status !== 'placed') redirect(orderHref);
  const one = item ? order.items.filter((i) => i.productId === item) : [];
  const items = one.length ? one : order.items;
  const from = firstName(user);
  const placed = new Date(order.placedAt ?? order.createdAt);
  const cell = 'border-b border-line-2 px-3 py-2.5 align-top';

  return (
    <div className="min-h-screen bg-bg px-[clamp(12px,3vw,24px)] pb-16 pt-6 text-ink print:bg-white print:p-0">
      <nav className="mx-auto mb-4 flex max-w-[720px] flex-wrap items-center justify-between gap-3 print:hidden" aria-label="Gift receipt">
        <a href={orderHref} className="text-[14px] text-ink underline underline-offset-2">← Back to order</a>
        <PrintButton label="Print gift receipt" />
      </nav>

      <article className="mx-auto flex max-w-[720px] flex-col gap-6 rounded-panel border border-line bg-surface p-[clamp(18px,4vw,40px)] print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Wordmark />
            <p className="m-0 text-[13px] text-ink-3">Demo store · no real goods or payments</p>
          </div>
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">Gift receipt</h1>
        </header>

        <section aria-labelledby="gift-h" className="flex flex-col gap-2 rounded-card bg-surface-2 p-4 print:border print:border-line">
          <h2 id="gift-h" className="m-0 text-[18px] font-semibold">Enjoy your gift{from ? ` from ${from}` : ''}</h2>
          {order.gift?.message ? <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55] text-ink-2">{order.gift.message}</p> : null}
        </section>

        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-6 gap-y-3 text-[14px]">
          <div>
            <dt className="text-ink-3">Order number</dt>
            <dd className="m-0 font-mono">{order.id}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Ordered</dt>
            <dd className="m-0">{longDate(placed, store)}</dd>
          </div>
        </dl>

        <section aria-labelledby="gift-items-h" className="flex flex-col gap-2">
          <h2 id="gift-items-h" className="m-0 text-[15px] font-semibold">{items.length === 1 ? 'Item' : 'Items'}</h2>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="text-left text-[13px] text-ink-3">
                <th scope="col" className={`${cell} font-medium`}>Item</th>
                <th scope="col" className={`${cell} text-right font-medium`}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.productId}>
                  <td className={cell}>
                    <span className="block font-medium">{l.title}</span>
                    {l.size ? <span className="block text-[13px] text-ink-2">Size: {l.size}</span> : null}
                    <span className="block text-[13px] text-ink-3">Sold by {l.seller}</span>
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>{l.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="border-t border-line-2 pt-4 text-[12px] leading-relaxed text-ink-3">
          No prices are shown. To return or exchange something, ask the sender: they can start a return from Your Orders within {store.returns.days} days of delivery.
        </footer>
      </article>
    </div>
  );
}

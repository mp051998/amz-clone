import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Wordmark } from '@/components/chrome/Wordmark';
import { PrintButton } from '@/components/orders/PrintButton';
import { longDate, orderPaymentText, shortDate } from '@/components/orders/format';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { getOrder } from '@/lib/data/orders';
import { getOrderReturns } from '@/lib/data/returns';
import { buildInvoice, type InvoiceRefund } from '@/lib/invoice';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';
import type { ShippingAddress } from '@/lib/types';
import { protectionPlanName } from '@/lib/protection';
import { conditionLabel } from '@/lib/offers';

export const metadata: Metadata = { title: 'Invoice · Store' };

function addressLines(a: ShippingAddress): string[] {
  return [a.name, a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.postcode}`, a.phone ? `Phone ${a.phone}` : undefined].filter((x): x is string => Boolean(x));
}

function refundState(r: InvoiceRefund, store: Parameters<typeof shortDate>[1]): string {
  if (r.status === 'succeeded') return r.at ? `Refunded ${shortDate(new Date(r.at), store)}` : 'Refunded';
  return 'Processing';
}

/**
 * Printable invoice (Amazon's "Invoice" / printable order summary) for one of the shopper's orders:
 * a plain page with no store chrome, so it prints or saves as a PDF cleanly. A cancelled order gets
 * an order summary showing the refund instead; one still waiting for payment has none yet.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getMarketplace();
  const self = `/orders/${encodeURIComponent(id)}/invoice`;
  const user = await readUser();
  if (!user) redirect(storePath(store, `/signin?next=${encodeURIComponent(self)}`));
  const client = await db();
  const order = await getOrder(client, id);
  if (!order) notFound();
  if (order.market !== store.id) redirect(storePath({ id: order.market }, `/orders/${encodeURIComponent(order.id)}/invoice`));
  const orderHref = storePath(store, `/orders/${encodeURIComponent(order.id)}?placed=0`);
  const returns = order.status === 'placed' ? await getOrderReturns(client, order.id) : null;
  const inv = buildInvoice(order, returns?.returns ?? []);
  if (!inv) redirect(orderHref);

  const money = (minor: number) => formatMoney(minor, order.currency);
  const placed = new Date(order.placedAt ?? order.createdAt);
  const title = inv.kind === 'invoice' ? 'Invoice' : 'Order summary';
  const cell = 'border-b border-line-2 px-3 py-2.5 align-top';

  return (
    <div className="min-h-screen bg-bg px-[clamp(12px,3vw,24px)] pb-16 pt-6 text-ink print:bg-white print:p-0">
      <nav className="mx-auto mb-4 flex max-w-[860px] flex-wrap items-center justify-between gap-3 print:hidden" aria-label="Invoice">
        <a href={orderHref} className="text-[14px] text-ink underline underline-offset-2">← Back to order</a>
        <PrintButton label={inv.kind === 'invoice' ? 'Print invoice' : 'Print summary'} />
      </nav>

      <article className="mx-auto flex max-w-[860px] flex-col gap-7 rounded-panel border border-line bg-surface p-[clamp(18px,4vw,40px)] print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Wordmark />
            <p className="m-0 text-[13px] text-ink-3">Demo store · no real goods or payments · not a tax invoice</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <h1 className="m-0 text-[26px] font-semibold tracking-[-0.01em]">{title}</h1>
            {inv.kind === 'cancelled' ? <span className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-[13px] font-semibold">Cancelled</span> : null}
          </div>
        </header>

        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-6 gap-y-3 text-[14px]">
          <div>
            <dt className="text-ink-3">Order number</dt>
            <dd className="m-0 font-mono">{order.id}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Order placed</dt>
            <dd className="m-0">{longDate(placed, store)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Order total</dt>
            <dd className="m-0 font-semibold tabular-nums">{money(inv.totalMinor)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Payment</dt>
            <dd className="m-0">{orderPaymentText(order)}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
          {order.gst ? (
            <section aria-labelledby="bill-h" className="flex flex-col gap-1.5 text-[14px]">
              <h2 id="bill-h" className="m-0 text-[15px] font-semibold">Billed to</h2>
              <p className="m-0 leading-relaxed text-ink-2">
                <span className="block">{order.gst.name}</span>
                <span className="block">GSTIN <span className="font-mono">{order.gst.gstin}</span></span>
              </p>
            </section>
          ) : null}
          <section aria-labelledby="ship-h" className="flex flex-col gap-1.5 text-[14px]">
            <h2 id="ship-h" className="m-0 text-[15px] font-semibold">Shipping address</h2>
            <address className="not-italic leading-relaxed text-ink-2">
              {addressLines(order.shipTo).map((l) => (
                <span key={l} className="block">{l}</span>
              ))}
            </address>
          </section>
        </div>

        <section aria-labelledby="items-h" className="flex flex-col gap-2">
          <h2 id="items-h" className="m-0 text-[15px] font-semibold">Items</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left text-[13px] text-ink-3">
                  <th scope="col" className={`${cell} font-medium`}>Item</th>
                  <th scope="col" className={`${cell} text-right font-medium`}>Qty</th>
                  <th scope="col" className={`${cell} text-right font-medium`}>Unit price</th>
                  <th scope="col" className={`${cell} text-right font-medium`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.productId}>
                    <td className={cell}>
                      <span className="block font-medium">{l.title}</span>
                      {l.size ? <span className="block text-[13px] text-ink-2">Size: {l.size}</span> : null}
                      {l.condition ? <span className="block text-[13px] text-ink-2">Condition: {conditionLabel(l.condition)}</span> : null}
                      <span className="block text-[13px] text-ink-3">Sold by {l.seller}</span>
                      {l.discountMinor ? <span className="block text-[13px] text-ink-2">Coupon −{money(l.discountMinor)}</span> : null}
                      {l.qtyDiscountMinor ? <span className="block text-[13px] text-ink-2">Quantity discount −{money(l.qtyDiscountMinor)}</span> : null}
                      {l.promoMinor ? <span className="block text-[13px] text-ink-2">Promotion −{money(l.promoMinor)}</span> : null}
                      {l.snsMinor ? <span className="block text-[13px] text-ink-2">Subscribe &amp; Save −{money(l.snsMinor)}</span> : null}
                      {l.bankOfferMinor ? <span className="block text-[13px] text-ink-2">Bank offer −{money(l.bankOfferMinor)}</span> : null}
                      {l.protectionMinor ? <span className="block text-[13px] text-ink-2">{protectionPlanName(order.market)} {money(l.protectionMinor)}</span> : null}
                    </td>
                    <td className={`${cell} text-right tabular-nums`}>{l.qty}</td>
                    <td className={`${cell} text-right tabular-nums`}>{money(l.unitMinor)}</td>
                    <td className={`${cell} text-right tabular-nums`}>{money(l.amountMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="m-0 ml-auto flex w-full max-w-[320px] flex-col gap-1.5 pt-2 text-[14px]">
            <div className="flex justify-between gap-4"><dt className="text-ink-2">Items</dt><dd className="m-0 tabular-nums">{money(inv.subtotalMinor)}</dd></div>
            {inv.discountMinor > 0 ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Coupon savings</dt><dd className="m-0 tabular-nums">−{money(inv.discountMinor)}</dd></div>
            ) : null}
            {inv.qtyDiscountMinor > 0 ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Quantity discounts</dt><dd className="m-0 tabular-nums">−{money(inv.qtyDiscountMinor)}</dd></div>
            ) : null}
            {inv.snsMinor > 0 ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Subscribe &amp; Save</dt><dd className="m-0 tabular-nums">−{money(inv.snsMinor)}</dd></div>
            ) : null}
            {inv.promoMinor > 0 ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Promotion{inv.promoCode ? ` (${inv.promoCode})` : ''}</dt><dd className="m-0 tabular-nums">−{money(inv.promoMinor)}</dd></div>
            ) : null}
            {inv.bankOfferMinor > 0 ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Bank offer{inv.bank ? ` (${inv.bank})` : ''}</dt><dd className="m-0 tabular-nums">−{money(inv.bankOfferMinor)}</dd></div>
            ) : null}
            <div className="flex justify-between gap-4"><dt className="text-ink-2">Delivery</dt><dd className="m-0 tabular-nums">{inv.shipMinor === 0 ? 'FREE' : money(inv.shipMinor)}</dd></div>
            {inv.wrapMinor > 0 ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Gift wrap</dt><dd className="m-0 tabular-nums">{money(inv.wrapMinor)}</dd></div>
            ) : null}
            {inv.protectionMinor > 0 ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Protection plans</dt><dd className="m-0 tabular-nums">{money(inv.protectionMinor)}</dd></div>
            ) : null}
            {inv.taxMinor > 0 ? (
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Tax</dt><dd className="m-0 tabular-nums">{money(inv.taxMinor)}</dd></div>
            ) : (
              <div className="flex justify-between gap-4"><dt className="text-ink-2">Tax</dt><dd className="m-0 text-ink-3">{store.pricing.taxNote ?? 'Included'}</dd></div>
            )}
            <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2 text-[16px] font-semibold"><dt>Order total</dt><dd className="m-0 tabular-nums">{money(inv.totalMinor)}</dd></div>
          </dl>
        </section>

        {inv.refunds.length ? (
          <section aria-labelledby="refunds-h" className="flex flex-col gap-2">
            <h2 id="refunds-h" className="m-0 text-[15px] font-semibold">Refunds</h2>
            <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
              {inv.refunds.map((r, i) => (
                <li key={`${r.label}-${i}`} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-line-2 py-2.5">
                  <span>
                    {r.label} <span className="text-ink-3">· {refundState(r, store)}</span>
                  </span>
                  <span className="tabular-nums">−{money(r.amountMinor)}</span>
                </li>
              ))}
            </ul>
            <div className="ml-auto flex w-full max-w-[320px] justify-between gap-4 pt-1 text-[16px] font-semibold">
              <span>Total paid after refunds</span>
              <span className="tabular-nums">{money(inv.netMinor)}</span>
            </div>
          </section>
        ) : !inv.charged ? (
          <p className="m-0 text-[14px] text-ink-2">Nothing was charged for this order.</p>
        ) : null}

        <footer className="border-t border-line-2 pt-4 text-[12px] leading-relaxed text-ink-3">
          Prices are in {order.currency}. Each item is sold by the seller shown. Keep this for your records; you can print or save it again any time from Your Orders.
        </footer>
      </article>
    </div>
  );
}

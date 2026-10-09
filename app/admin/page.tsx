import type { Metadata } from 'next';
import { cn } from '@/components/lib/cn';
import { adminOverview, attentionCount } from '@/lib/data/admin-overview';
import { LOW_STOCK } from '@/lib/data/admin-catalog';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminTime } from './orders/labels';
import { adminPage } from './guard';
import { AdminFrame, AdminOnly } from './ui';

export const metadata: Metadata = { title: 'Overview · Admin · Store' };

interface Tile {
  label: string;
  count: number;
  href: string;
  /** what the number means, or what to do */
  note: string;
  /** bad: money or a shopper is stuck · warn: work waiting · none: for information */
  tone: 'bad' | 'warn' | 'none';
}

/**
 * /admin (and /in/admin): what needs doing in this store. Each tile counts one queue, as its own
 * page's tab does, and opens it.
 */
export default async function AdminHome() {
  const { store, admin } = await adminPage('/admin');
  if (!admin) return <AdminOnly store={store} />;
  const o = await adminOverview(await db(), store.id);
  const to = (path: string) => storePath(store, path);
  const n = (v: number) => v.toLocaleString('en-US');
  const todo = attentionCount(o);

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: 'Orders & money',
      tiles: [
        { label: 'Orders to ship', count: o.orders.toShip, href: to('/admin/orders?filter=preparing'), note: 'Placed, not shipped yet.', tone: 'warn' },
        { label: 'Order refund problems', count: o.orders.refundIssues, href: to('/admin/orders?filter=refund_issues'), note: 'Cancelled card orders whose refund didn’t go through.', tone: 'bad' },
        { label: 'Returns to process', count: o.returns.open, href: to('/admin/returns'), note: 'Requested or on the way back: receive them to refund.', tone: 'warn' },
        { label: 'A-to-z claims', count: o.claims, href: to('/admin/claims'), note: 'Shoppers asking the store to step in on another seller’s order.', tone: 'warn' },
        { label: 'Return refund problems', count: o.returns.refundIssues, href: to('/admin/returns?filter=refund_issues'), note: 'Received returns whose refund didn’t go through.', tone: 'bad' },
        { label: 'In transit', count: o.orders.inTransit, href: to('/admin/orders?filter=shipped'), note: 'Shipped, not delivered yet.', tone: 'none' },
      ],
    },
    {
      title: 'Shoppers',
      tiles: [
        {
          label: 'Support cases waiting',
          count: o.support.waiting,
          href: to('/admin/support'),
          note: o.support.oldestWaiting ? `Longest waiting since ${adminTime(o.support.oldestWaiting, store)}.` : 'New cases and shoppers’ replies show up here.',
          tone: 'warn',
        },
        { label: 'Reported reviews', count: o.reportedReviews, href: to('/admin/reviews'), note: 'Reviews with open reports: keep, hide or delete them.', tone: 'warn' },
        { label: 'Unanswered questions', count: o.unansweredQuestions, href: to('/admin/questions'), note: 'Product questions nobody has answered yet.', tone: 'warn' },
        { label: 'Reported answers', count: o.reportedAnswers, href: to('/admin/questions?view=reported'), note: 'Questions with an answer shoppers reported: keep or delete it.', tone: 'warn' },
      ],
    },
    {
      title: 'Catalogue',
      tiles: [
        { label: 'Out of stock', count: o.stock.out, href: to('/admin/products?stock=out'), note: 'On sale with none left: shoppers can’t buy them.', tone: 'bad' },
        { label: 'Product reports', count: o.productReports, href: to('/admin/product-reports'), note: 'Shoppers say a listing is wrong, fake, unsafe or offensive.', tone: 'warn' },
        { label: 'Lower prices', count: o.lowerPrices, href: to('/admin/product-reports/lower-prices'), note: 'Shoppers say they saw a product for less elsewhere.', tone: 'warn' },
        { label: 'Low stock', count: o.stock.low, href: to('/admin/products?stock=low'), note: `On sale with 1 to ${LOW_STOCK} left.`, tone: 'warn' },
      ],
    },
  ];

  return (
    <AdminFrame
      store={store}
      path="/admin"
      title="Overview"
      lede={todo ? <>{n(todo)} {todo === 1 ? 'thing needs' : 'things need'} doing in this store.</> : <>Nothing is waiting on you in this store.</>}
    >
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`ov-${g.title}`} className="flex flex-col gap-3">
          <h2 id={`ov-${g.title}`} className="m-0 text-[18px] font-semibold">{g.title}</h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-3 p-0">
            {g.tiles.map((t) => {
              const flagged = t.count > 0 && t.tone !== 'none';
              return (
                <li key={t.label}>
                  <a
                    href={t.href}
                    aria-label={`${t.label}: ${n(t.count)}`}
                    className={cn(
                      'flex h-full flex-col gap-1.5 rounded-panel border bg-surface p-[18px] text-ink no-underline hover:border-ink',
                      flagged && t.tone === 'bad' ? 'border-bad' : 'border-line',
                    )}
                  >
                    <span className="text-[14px] font-semibold">{t.label}</span>
                    <strong
                      className={cn(
                        'text-[32px] font-semibold leading-none tabular-nums',
                        !t.count ? 'text-ink-3' : flagged && t.tone === 'bad' ? 'text-bad' : 'text-ink',
                      )}
                    >
                      {n(t.count)}
                    </strong>
                    <span className="text-[13px] leading-[1.45] text-ink-2">{t.count || t.tone === 'none' ? t.note : 'All clear.'}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </AdminFrame>
  );
}

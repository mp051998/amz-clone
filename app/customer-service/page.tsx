import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, DemoNote } from '@/components/brand/Page';
import { buttonClasses } from '@/components/primitives/Button';
import { ProductFrame } from '@/components/decision';
import { StatusChip } from '@/components/orders/Tracking';
import { orderView } from '@/components/orders/format';
import { listOrders } from '@/lib/data/orders';
import { helpTopics } from '@/lib/help-topics';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { readUser } from '@/lib/auth';
import { unreadCaseIds } from '@/lib/data/support';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Help · Store' };

/** Recent orders offered under "Get help with a recent order". */
const RECENT_ORDERS = 4;

/** Quick-action cards — the descriptor differs per store where the flow does. */
function quickActions(isIN: boolean) {
  return [
    { title: 'Track an order', line: 'See where a package is, edit or cancel an order, and view invoices.', href: '/orders' },
    {
      title: 'Returns & refunds',
      line: isIN ? 'Return or replace items, schedule a pickup, and track refunds.' : 'Return or replace items and track your refund.',
      // the returns centre: where each return stands, and the way to start one from an order
      href: '/returns',
    },
    {
      title: 'Payments & gift cards',
      line: isIN ? 'Manage cards, UPI, your store balance and gift cards.' : 'Manage payment methods, gift cards and your balance.',
      href: '/account/payments',
    },
    { title: 'Plus membership', line: 'View benefits, change plan, or cancel your Plus membership.', href: '/prime' },
    { title: 'Login & security', line: 'Change your password, email, name or mobile number.', href: '/account/security' },
    { title: 'Saved items & collections', line: 'Find what you saved, and turn price tracking on or off.', href: '/collections' },
  ];
}

/** Common questions — native <details>, no JS. */
function commonQuestions(isIN: boolean) {
  return [
    { q: 'How do I track a package?', a: 'Open Orders, choose the order, and select “Track order” to see each step and the expected delivery date.' },
    {
      q: 'How do I return an item?',
      a: isIN
        ? 'Open Orders, choose “Return or replace”, pick a reason, and schedule a pickup. Cash on Delivery orders are refunded to your bank account or store balance.'
        : 'Open Orders, choose “Return or replace”, pick a reason, and print the prepaid label to drop the package off.',
    },
    {
      q: 'How do I change my payment method?',
      a: isIN
        ? 'Go to Account, then Payment options, to add or remove cards, UPI, net banking, or your store balance.'
        : 'Go to Account, then Payment options, to add, edit or remove cards and your gift card balance.',
    },
    { q: 'Where is my refund?', a: 'Once we receive your return, the refund goes to your original payment method. Most complete within 3–5 business days.' },
    { q: 'How do I cancel Plus?', a: 'Go to Account, open Plus membership, and choose “Manage membership”. You keep the benefits until the current period ends.' },
    { q: 'Why is a product ranked above another?', a: 'Search results are ranked by how well each product matches the priorities you set. Every card shows why it’s there and its main trade-off.' },
  ];
}

export default async function CustomerServicePage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sp = (p: string) => storePath(store, p);
  const tiles = quickActions(isIN);
  const questions = commonQuestions(isIN);
  const user = await readUser();
  const client = user ? await db() : null;
  // signed in: say when the store has replied on a case since the shopper last looked, and offer
  // their latest placed orders to get help with
  const [unread, recent] = client
    ? await Promise.all([
        unreadCaseIds(client, store.id).then((ids) => ids.size),
        listOrders(client, store.id, { limit: RECENT_ORDERS * 2 })
          .then((orders) => orders.filter((o) => o.placedAt).slice(0, RECENT_ORDERS))
          .catch(() => []),
      ])
    : [0, []];
  const now = new Date();

  return (
    <AppShell>
      <Page>
        <PageHead kicker="Help" title="What can we help you with?">
          Manage an order, find an answer, or get in touch.
        </PageHead>

        <form action={sp('/s')} role="search" className="flex max-w-[680px] items-center gap-2 rounded-panel border-[1.5px] border-ink bg-surface p-2 shadow-hero focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          <label htmlFor="help-q" className="sr-only">Search help and products</label>
          <input
            id="help-q"
            type="text"
            name="k"
            placeholder="Search help or products"
            className="h-11 min-w-0 flex-1 rounded-input bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-ink-4"
          />
          <button type="submit" className={buttonClasses({ variant: 'primary' })}>Search</button>
        </form>

        {recent.length ? (
          <Section title="Get help with a recent order" note={<a href={sp('/orders')} className="text-ink underline underline-offset-2">See all orders</a>}>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3.5 p-0">
              {recent.map((o) => {
                const [first] = o.items;
                const more = o.items.length - 1;
                const v = orderView(o, store, now);
                return (
                  <li key={o.id}>
                    <a
                      href={sp(`/customer-service/contact?order=${encodeURIComponent(o.id)}`)}
                      className="flex h-full gap-3 rounded-card border border-line bg-surface p-3.5 text-ink no-underline transition-colors hover:border-ink hover:text-ink"
                    >
                      {first ? (
                        <span className="w-14 flex-none">
                          <ProductFrame src={first.image} alt="" aspect="1/1" />
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-col items-start gap-1.5">
                        <StatusChip label={v.chip.label} tone={v.chip.tone} />
                        <span className="line-clamp-2 text-[15px] font-semibold leading-snug">
                          {first ? first.title : 'Order'}
                          {more > 0 ? <span className="font-normal text-ink-2"> and {more} more</span> : null}
                        </span>
                        <span className="font-mono text-[12px] text-ink-3">{o.id}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        <Section title="Quick actions">
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3.5 p-0">
            {tiles.map((t) => (
              <li key={t.title}>
                <a href={sp(t.href)} className="flex h-full flex-col gap-1.5 rounded-card border border-line bg-surface p-[18px] text-ink no-underline transition-colors hover:border-ink">
                  <span className="text-[17px] font-semibold leading-tight">{t.title} <span aria-hidden className="text-ink-3">→</span></span>
                  <span className="text-[14px] leading-relaxed text-ink-2">{t.line}</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid items-start gap-11 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-8">
          <Section title="Browse help topics">
            <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
              {helpTopics(store).map((topic) => (
                <li key={topic.slug} className="border-b border-line-2 last:border-b-0">
                  <a
                    href={sp(`/customer-service/help/${topic.slug}`)}
                    className="flex min-h-12 items-center justify-between px-[18px] text-[15px] text-ink no-underline hover:bg-surface-2 hover:text-ink"
                  >
                    {topic.title}
                    <span className="text-ink-3" aria-hidden>›</span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Common questions">
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {questions.map((item) => (
                <details key={item.q} className="group border-b border-line-2 last:border-b-0">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-[18px] py-3 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex-none text-[14px] text-ink-3 transition-transform group-open:rotate-180" aria-hidden>▾</span>
                  </summary>
                  <p className="m-0 px-[18px] pb-4 text-[14px] leading-relaxed text-ink-2">{item.a}</p>
                </details>
              ))}
            </div>
          </Section>
        </div>

        <section className="flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-5 sm:p-7 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1.5">
            <h2 className="m-0 text-[22px] font-semibold leading-tight text-ink">Still need help?</h2>
            <p className="m-0 text-[15px] text-ink-2">
              Tell us what’s wrong, about an order or anything else. We reply on your case, and you can follow up there until it’s sorted.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <a href={sp('/customer-service/contact')} className={buttonClasses({ variant: 'dark' })}>Contact us</a>
            <a href={sp('/customer-service/cases')} className={buttonClasses({ variant: 'secondary' })}>
              Your support cases{unread ? ` · ${unread === 1 ? '1 new reply' : `${unread} with new replies`}` : ''}
            </a>
          </div>
        </section>

        <DemoNote>
          Demo store — replies come from the store’s admins, and there’s no phone or chat line. See the{' '}
          <a href={sp('/legal/conditions-of-use')} className="text-ink-2 underline underline-offset-2 hover:text-accent-ink">conditions of use</a>.
        </DemoNote>
      </Page>
    </AppShell>
  );
}

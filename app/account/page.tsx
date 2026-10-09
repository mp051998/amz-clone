import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Kicker } from '@/components/decision';
import { Button } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { countOrders } from '@/lib/data/orders';
import { listAddresses } from '@/lib/data/addresses';
import { backInStock, listCollections, priceDrops } from '@/lib/data/collections';
import { plusMembership } from '@/lib/data/plus';
import { awaitingReview } from '@/lib/data/reviews';
import { storeBalance } from '@/lib/data/balance';
import { unreadCaseIds } from '@/lib/data/support';
import { inboxSeenAt, isNewMessage, listInbox } from '@/lib/data/inbox';
import { mutedTopics, type MessageTopic } from '@/lib/data/message-preferences';
import { followedBrands } from '@/lib/data/brand-follows';
import { listSubscriptions } from '@/lib/data/subscriptions';
import { formatMoney } from '@/lib/marketplaces';
import { viewerCart } from '@/lib/storefront';
import { historyPaused, readRecentIds } from '@/lib/recent';
import { getMarketplace } from '@/lib/marketplace-server';
import { hasTradeIn } from '@/lib/trade-in';
import { storePath } from '@/lib/marketplace';
import { signOut } from '@/app/actions/auth';
import { shortDate } from '@/components/orders/format';

export const metadata: Metadata = { title: 'Account · Store' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Amazon's link boxes under the account cards: the rest of the account, one link each. */
function moreLinks(store: { id: string }): { title: string; links: { label: string; href: string }[] }[] {
  return [
    {
      title: 'Ordering and shopping preferences',
      links: [
        { label: 'Archived orders', href: '/orders?period=archived' },
        { label: 'Your returns', href: '/returns' },
        { label: 'Coupons', href: '/coupons' },
        { label: 'Registry & gift lists', href: '/registry' },
        { label: 'Recalls and product safety alerts', href: '/recalls' },
      ],
    },
    {
      title: 'Other programs',
      links: [
        ...(store.id === 'IN' ? [{ label: 'Store Pay', href: '/amazon-pay' }] : []),
        { label: 'Plus Video', href: '/prime-video' },
        { label: 'Business account', href: '/business' },
        { label: 'Sell with us', href: '/sell' },
      ],
    },
  ];
}

export default async function AccountPage() {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/account'));
  const client = await db();
  const [orderCount, addresses, collections, cart, recent, paused, plus, balance, toReview, unread, inbox, seenAt, brands, subs, muted] = await Promise.all([
    countOrders(client, store.id),
    listAddresses(client, store.id),
    listCollections(client, store.id).catch(() => []),
    viewerCart(),
    readRecentIds(),
    historyPaused(),
    plusMembership(client),
    storeBalance(client, store.id),
    awaitingReview(client, store.id, user.id).catch(() => []),
    unreadCaseIds(client, store.id),
    listInbox(client, store.id, user.id, new Date(), store.dates.timeZone).catch(() => []),
    inboxSeenAt(client, store.id),
    followedBrands(client, store.id, user.id).catch(() => []),
    listSubscriptions(client, store.id),
    mutedTopics(client, user.id).catch((): Set<MessageTopic> => new Set()),
  ]);
  const newMessages = inbox.filter((m) => isNewMessage(m, seenAt)).length;
  const saved = collections.reduce((n, c) => n + c.items.length, 0);
  const savedItems = collections.flatMap((c) => c.items);
  const drops = priceDrops(savedItems).length;
  const back = backInStock(savedItems).length;
  const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0];

  const tiles = [
    { title: 'Orders', meta: orderCount ? plural(orderCount, 'order') : 'No orders yet', desc: 'Track deliveries and see what you bought.', href: '/orders' },
    { title: 'Collections', meta: saved ? `${plural(saved, 'saved item')} · ${plural(collections.length, 'list')}${back ? ` · ${back} back in stock` : ''}${drops ? ` · ${plural(drops, 'price drop')}` : ''}` : 'Nothing saved yet', desc: 'Saved products with prices tracked since you saved them.', href: '/collections' },
    { title: 'Addresses', meta: addresses.length ? `${plural(addresses.length, 'address', 'addresses')}${defaultAddr ? ` · default ${defaultAddr.city}` : ''}` : 'None saved', desc: 'Where your orders go. Pick one at checkout.', href: '/account/addresses' },
    {
      title: 'Plus membership',
      meta: plus
        ? plus.shared
          ? `Shared by ${plus.shared.ownerName ?? 'your household'}`
          : plus.renewsAt
            ? `Member · ${plus.autoRenew ? 'renews' : 'ends'} ${shortDate(new Date(plus.renewsAt), store)}`
            : 'Member · FREE delivery'
        : 'Not a member',
      desc: plus?.shared
        ? 'FREE delivery on every order and FREE faster delivery, shared through your household.'
        : plus
          ? 'FREE delivery on every order and FREE faster delivery. End it any time.'
          : 'FREE delivery on every order, with no minimum. Free in this demo.',
      href: '/prime',
    },
    {
      title: 'Gift card balance',
      meta: balance ? formatMoney(balance, store.currency.code) : 'No balance yet',
      desc: 'Redeem gift cards and pay with your balance at checkout.',
      href: '/gift-cards#balance',
    },
    ...(hasTradeIn(store.id)
      ? [{ title: 'Trade-In', meta: 'Old phones and laptops', desc: 'Trade in an old phone or laptop for credit on your balance, and track the ones you’ve sent.', href: '/trade-in' }]
      : []),
    {
      title: 'Subscribe & Save',
      meta: subs.length ? `${plural(subs.length, 'subscription')}${subs.some((s) => s.issue) ? ' · needs attention' : ''}` : 'No subscriptions',
      desc: 'Deliveries every few months, for less. Skip, change or cancel them.',
      href: '/subscribe-save',
    },
    { title: 'Your messages', meta: newMessages ? `${newMessages} new` : 'Order and return updates', desc: 'Shipping and delivery updates, refunds, our replies and answers to your questions.', href: '/account/messages' },
    {
      title: 'Communication preferences',
      meta: muted.size ? `${plural(muted.size, 'kind')} of message turned off` : 'All messages on',
      desc: 'Choose which messages you get: review requests, answers to your questions and deal alerts.',
      href: '/account/communications',
    },
    { title: 'Your Payments', meta: 'Saved cards', desc: 'Cards you’ve saved for paying on Stripe. Add or remove them.', href: '/account/payments' },
    { title: 'Your transactions', meta: 'Charges and refunds', desc: 'Every charge and refund: orders, cancellations, returns, gift cards and balance reloads.', href: '/account/transactions' },
    { title: 'Login & security', meta: user.email, desc: 'Change your name, email or password, download your data, or close your account.', href: '/account/security' },
    { title: 'Cart', meta: cart.count ? plural(cart.count, 'item') : 'Empty', desc: 'Pick up where you left off.', href: '/cart' },
    {
      title: 'Brands you follow',
      meta: brands.length ? plural(brands.length, 'brand') : 'None yet',
      desc: 'What’s new from the brands you follow. Follow one from its store.',
      href: '/account/brands',
    },
    { title: 'Buy again', meta: orderCount ? 'From your orders' : 'Nothing to reorder yet', desc: 'Things you have ordered before, ready to add to your cart.', href: '/orders/buy-again' },
    { title: 'Your reviews', meta: toReview.length ? `${plural(toReview.length, 'item')} to review` : 'All caught up', desc: 'Review what you’ve received, and edit or delete reviews you’ve written.', href: '/account/reviews' },
    { title: 'Your Q&A', meta: 'Questions and answers', desc: 'Questions you’ve asked about products, and answers you’ve given. Delete any of them.', href: '/account/questions' },
    // the device's history spans both stores, so no count here: the page shows this store's share
    { title: 'Browsing history', meta: paused ? 'Paused' : recent.length ? 'On this device' : 'Nothing viewed yet', desc: 'Products you looked at recently. Pause or clear it any time.', href: '/history' },
    { title: 'Your recommendations', meta: 'From what you view and buy', desc: 'Products picked for you from your browsing history and orders. Choose what they’re based on.', href: '/recommendations' },
    { title: 'Customer service', meta: 'Help', desc: 'Returns, refunds, delivery problems and order changes.', href: '/customer-service' },
    { title: 'Your support cases', meta: unread.size ? (unread.size === 1 ? 'New reply on 1 case' : `New replies on ${unread.size} cases`) : 'Messages with us', desc: 'What you’ve asked us and our replies. Reply on a case or close it.', href: '/customer-service/cases' },
  ];

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Account</h1>
          <span className="text-[15px] text-ink-2">
            Signed in as <b className="font-semibold text-ink">{user.name}</b> · {user.email}
          </span>
        </div>

        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5 p-0">
          {tiles.map((t) => (
            <li key={t.title}>
              <a
                href={sp(t.href)}
                className="flex h-full min-h-[120px] flex-col gap-1.5 rounded-card border border-line bg-surface p-[18px] text-ink no-underline transition-colors hover:border-ink hover:text-ink"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[18px] font-semibold">{t.title}</span>
                  <span aria-hidden className="text-ink-3">→</span>
                </span>
                <Kicker>{t.meta}</Kicker>
                <span className="text-[14px] text-ink-2">{t.desc}</span>
              </a>
            </li>
          ))}
        </ul>

        <section aria-labelledby="account-more" className="flex flex-col gap-3">
          <h2 id="account-more" className="m-0 text-[22px] font-semibold leading-tight">More in your account</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
            {moreLinks(store).map((g) => (
              <nav key={g.title} aria-label={g.title} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-[18px]">
                <h3 className="m-0 text-[16px] font-semibold">{g.title}</h3>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <a href={sp(l.href)} className="text-[14px] text-ink no-underline hover:text-ink hover:underline hover:underline-offset-2">{l.label}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-[18px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[16px] font-semibold">Shopping in {store.id === 'IN' ? 'India' : 'the United States'}</span>
            <span className="text-[14px] text-ink-2">Orders, addresses and collections are kept per store.</span>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="secondary">Sign out</Button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}

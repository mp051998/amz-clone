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
import { formatMoney } from '@/lib/marketplaces';
import { viewerCart } from '@/lib/storefront';
import { historyPaused, readRecentIds } from '@/lib/recent';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { signOut } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Account · Store' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function AccountPage() {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/account'));
  const client = await db();
  const [orderCount, addresses, collections, cart, recent, paused, plus, balance, toReview, unread] = await Promise.all([
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
  ]);
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
      meta: plus ? 'Member · FREE delivery' : 'Not a member',
      desc: plus ? 'FREE delivery on every order and FREE faster delivery. End it any time.' : 'FREE delivery on every order, with no minimum. Free in this demo.',
      href: '/prime',
    },
    {
      title: 'Gift card balance',
      meta: balance ? formatMoney(balance, store.currency.code) : 'No balance yet',
      desc: 'Redeem gift cards and pay with your balance at checkout.',
      href: '/gift-cards#balance',
    },
    { title: 'Your transactions', meta: 'Charges and refunds', desc: 'Every charge and refund: orders, cancellations, returns and gift cards.', href: '/account/transactions' },
    { title: 'Login & security', meta: user.email, desc: 'Change your name, email or password, download your data, or close your account.', href: '/account/security' },
    { title: 'Cart', meta: cart.count ? plural(cart.count, 'item') : 'Empty', desc: 'Pick up where you left off.', href: '/cart' },
    { title: 'Buy again', meta: orderCount ? 'From your orders' : 'Nothing to reorder yet', desc: 'Things you have ordered before, ready to add to your cart.', href: '/orders/buy-again' },
    { title: 'Your reviews', meta: toReview.length ? `${plural(toReview.length, 'item')} to review` : 'All caught up', desc: 'Review what you’ve received, and edit or delete reviews you’ve written.', href: '/account/reviews' },
    { title: 'Your Q&A', meta: 'Questions and answers', desc: 'Questions you’ve asked about products, and answers you’ve given. Delete any of them.', href: '/account/questions' },
    // the device's history spans both stores, so no count here: the page shows this store's share
    { title: 'Browsing history', meta: paused ? 'Paused' : recent.length ? 'On this device' : 'Nothing viewed yet', desc: 'Products you looked at recently. Pause or clear it any time.', href: '/history' },
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

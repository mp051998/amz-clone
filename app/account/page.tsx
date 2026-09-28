import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Kicker } from '@/components/decision';
import { Button } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { countOrders } from '@/lib/data/orders';
import { listAddresses } from '@/lib/data/addresses';
import { listCollections } from '@/lib/data/collections';
import { viewerCart } from '@/lib/storefront';
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
  const [orderCount, addresses, collections, cart] = await Promise.all([
    countOrders(client, store.id),
    listAddresses(client, store.id),
    listCollections(client, store.id).catch(() => []),
    viewerCart(),
  ]);
  const saved = collections.reduce((n, c) => n + c.items.length, 0);
  const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0];

  const tiles = [
    { title: 'Orders', meta: orderCount ? plural(orderCount, 'order') : 'No orders yet', desc: 'Track deliveries and see what you bought.', href: '/orders' },
    { title: 'Collections', meta: saved ? `${plural(saved, 'saved item')} · ${plural(collections.length, 'list')}` : 'Nothing saved yet', desc: 'Saved products with prices tracked since you saved them.', href: '/collections' },
    { title: 'Addresses', meta: addresses.length ? `${plural(addresses.length, 'address', 'addresses')}${defaultAddr ? ` · default ${defaultAddr.city}` : ''}` : 'None saved', desc: 'Where your orders go. Pick one at checkout.', href: '/account/addresses' },
    { title: 'Cart', meta: cart.count ? plural(cart.count, 'item') : 'Empty', desc: 'Pick up where you left off.', href: '/cart' },
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

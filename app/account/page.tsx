import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { readUser } from '@/lib/auth';
import { readOrders } from '@/lib/orders';
import { readAddresses } from '@/lib/addresses';
import { signOut } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Your Account | Amazon.com' };

const TILES = [
  { title: 'Your Orders', desc: 'Track, return, or buy things again', href: '/orders', icon: '📦' },
  { title: 'Login & Security', desc: 'Edit login, name, and mobile number', href: '/account', icon: '🔒' },
  { title: 'Your Addresses', desc: 'Edit addresses for orders and gifts', href: '/account/addresses', icon: '📍' },
  { title: 'Your Payments', desc: 'Manage payment methods and settings', href: '/account', icon: '💳' },
  { title: 'Prime', desc: 'Manage your membership and benefits', href: '/account', icon: '⭐' },
  { title: 'Digital Services', desc: 'Manage devices, content, and apps', href: '/account', icon: '📱' },
];

export default async function AccountPage() {
  const user = await readUser();
  if (!user) redirect('/signin?next=/account');
  const orderCount = (await readOrders()).length;
  const addressCount = (await readAddresses()).length;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1000px] px-4 py-5">
        <h1 className="text-[28px] font-normal text-ink">Your Account</h1>
        <p className="mt-1 text-[14px] text-ink-2">Signed in as <b className="text-ink">{user.name}</b> · {user.email}</p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map((t) => (
            <a key={t.title} href={t.href} className="flex items-start gap-4 rounded-[8px] border border-line bg-white p-4 hover:bg-surface-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[24px]" aria-hidden>{t.icon}</span>
              <span>
                <span className="block text-[17px] font-bold text-ink">{t.title}</span>
                <span className="block text-[13px] text-ink-2">
                  {t.title === 'Your Orders' && orderCount > 0 ? `${orderCount} order${orderCount === 1 ? '' : 's'} · ` : ''}
                  {t.title === 'Your Addresses' && addressCount > 0 ? `${addressCount} saved · ` : ''}
                  {t.desc}
                </span>
              </span>
            </a>
          ))}
        </div>

        <form action={signOut} className="mt-6">
          <button type="submit" className="h-[33px] rounded-pill border border-line bg-surface-2 px-6 text-[14px] text-ink hover:bg-surface-3">
            Sign out
          </button>
        </form>
      </div>
    </AppShell>
  );
}

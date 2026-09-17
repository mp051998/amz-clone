import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `Amazon Business | Amazon.${store.id === 'IN' ? 'in' : 'com'}` };
}

const BENEFITS = [
  { icon: '🏷️', title: 'Business pricing', desc: 'Discounts and quantity breaks on eligible items across the catalogue.' },
  { icon: '👥', title: 'Multi-user accounts', desc: 'Add your team, set approval workflows, and share payment methods.' },
  { icon: '🧾', title: 'GST-ready invoices', desc: 'Downloadable tax invoices on every order for painless reconciliation.' },
  { icon: '📊', title: 'Spend analytics', desc: 'See who bought what, track budgets, and export reports in a click.' },
  { icon: '🚚', title: 'Fast, free delivery', desc: 'Free delivery on qualifying business orders, with scheduled options.' },
  { icon: '🔒', title: 'Guided buying', desc: 'Steer purchases to preferred products and stay within policy.' },
];

const STEPS = [
  { n: '1', title: 'Create a free account', desc: 'Sign up with your work email in a couple of minutes.' },
  { n: '2', title: 'Add your team', desc: 'Invite buyers and set up approval rules that fit how you work.' },
  { n: '3', title: 'Start buying smarter', desc: 'Shop business prices and keep every invoice in one place.' },
];

export default async function BusinessPage() {
  const store = await getMarketplace();
  const tld = store.id === 'IN' ? 'in' : 'com';

  return (
    <AppShell>
      {/* hero */}
      <section className="bg-gradient-to-br from-[#232F3E] to-[#37475A] text-white">
        <div className="mx-auto max-w-[1200px] px-4 py-14">
          <div className="flex items-end gap-1 text-[26px] font-bold leading-none">
            <span>amazon</span><span className="text-cta-orange">business</span>
          </div>
          <h1 className="mt-4 max-w-[640px] text-[34px] font-bold leading-tight">Everything your business needs, in one account</h1>
          <p className="mt-2 max-w-[560px] text-[15px] text-line-2">
            Business pricing, multi-user accounts, and tax-ready invoicing — built on the selection you already know.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={storePath(store, '/signin?new=1')} className="rounded-pill bg-cta-yellow px-6 py-2.5 text-[14px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">Create a free account</a>
            <a href="#how" className="rounded-pill border border-white/60 px-6 py-2.5 text-[14px] font-bold text-white hover:bg-white/10">See how it works</a>
          </div>
          <p className="mt-3 text-[12px] text-line-2">Already selling? <a href={storePath(store, '/sell')} className="underline hover:text-white">Sell on Amazon Business</a>.</p>
        </div>
      </section>

      {/* benefits */}
      <section className="mx-auto max-w-[1200px] px-4 py-10">
        <h2 className="text-[22px] font-bold text-ink">Why Amazon Business</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-[8px] border border-line bg-white p-5">
              <div className="text-[28px]" aria-hidden>{b.icon}</div>
              <h3 className="mt-2 text-[15px] font-bold text-ink">{b.title}</h3>
              <p className="mt-1 text-[13px] leading-5 text-ink-2">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="bg-surface-band">
        <div className="mx-auto max-w-[1200px] px-4 py-10">
          <h2 className="text-[22px] font-bold text-ink">Get started in three steps</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-[8px] border border-line bg-white p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-nav-main text-[15px] font-bold text-white">{s.n}</span>
                <h3 className="mt-3 text-[15px] font-bold text-ink">{s.title}</h3>
                <p className="mt-1 text-[13px] leading-5 text-ink-2">{s.desc}</p>
              </div>
            ))}
          </div>
          <a href={storePath(store, '/signin?new=1')} className="mt-6 inline-block rounded-pill bg-cta-yellow px-6 py-2.5 text-[14px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover">Create a free account</a>
        </div>
      </section>

      <p className="mx-auto max-w-[1200px] px-4 py-6 text-center text-[12px] text-ink-4">
        Demo experience on Amazon.{tld} — Amazon Business features are illustrative and no real account is created.
      </p>
    </AppShell>
  );
}

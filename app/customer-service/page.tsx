import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `Customer Service | Amazon.${store.id === 'IN' ? 'in' : 'com'}` };
}

/** Big quick-action tiles — one-line descriptor differs per store where the flow does. */
function quickActions(isIN: boolean) {
  return [
    {
      icon: '📦',
      title: "Where's my stuff?",
      line: 'Track packages, edit or cancel orders, and view invoices.',
      href: '/orders',
    },
    {
      icon: '↩️',
      title: 'Returns & Refunds',
      line: isIN
        ? 'Return or replace items, schedule pickup, and track refunds.'
        : 'Return or replace items and track your refund.',
      href: '/orders',
    },
    {
      icon: '💳',
      title: 'Payment & Gift Cards',
      line: isIN
        ? 'Manage cards, UPI, Amazon Pay balance, and gift cards.'
        : 'Manage payment methods, gift cards, and your balance.',
      href: '/account',
    },
    {
      icon: '⭐',
      title: 'Manage Prime',
      line: 'View benefits, update, or cancel your Prime membership.',
      href: '/account',
    },
    {
      icon: '🔒',
      title: 'Login & Security',
      line: 'Change your password, email, name, or mobile number.',
      href: '/account',
    },
    {
      icon: '📱',
      title: 'Devices & Digital',
      line: 'Get help with your devices, apps, and digital content.',
      href: '/account',
    },
  ];
}

/** Two-column "Browse help topics" list. */
const HELP_TOPICS = [
  'Ordering',
  'Shipping & Delivery',
  'Returns, Refunds & Exchanges',
  'Managing Your Account',
  'Payments, Pricing & Promotions',
  'Amazon Prime',
  'Devices',
];

/** Plain, styled "Common questions" list — question + short answer, no JS. */
function commonQuestions(isIN: boolean) {
  return [
    {
      q: 'How do I track a package?',
      a: 'Go to Your Orders, find the order, and select "Track package" to see the latest status and estimated delivery date.',
    },
    {
      q: 'How do I return an item?',
      a: isIN
        ? 'Open Your Orders, choose "Return or replace items", pick a reason, and schedule a pickup. Cash on Delivery orders are refunded to your bank account or Amazon Pay balance.'
        : 'Open Your Orders, choose "Return or replace items", pick a reason, and print the prepaid return label to drop the package off.',
    },
    {
      q: 'How do I change my payment method?',
      a: isIN
        ? 'Visit Your Account, then "Payment options", to add or remove cards, UPI, net banking, or your Amazon Pay balance.'
        : 'Visit Your Account, then "Payment options", to add, edit, or remove cards and your gift card balance.',
    },
    {
      q: 'Where is my refund?',
      a: 'Once we receive your return, refunds are issued to your original payment method. Most refunds complete within 3–5 business days after processing.',
    },
    {
      q: 'How do I cancel my Prime membership?',
      a: 'Go to Your Account, open "Prime", and select "Manage membership" to update or cancel. You keep benefits until the current period ends.',
    },
  ];
}

export default async function CustomerServicePage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const tiles = quickActions(isIN);
  const questions = commonQuestions(isIN);

  return (
    <AppShell>
      {/* 1. Header band with search */}
      <section className="bg-nav-main">
        <div className="mx-auto max-w-[1200px] px-4 py-8">
          <h1 className="text-[26px] font-bold text-white sm:text-[30px]">
            Hello. What can we help you with?
          </h1>
          <p className="mt-2 max-w-[640px] text-[14px] text-white/70">
            Browse help topics, manage your orders, or get in touch with {store.name} Customer
            Service.
          </p>
          <form
            action={storePath(store, '/s')}
            className="mt-5 flex max-w-[640px] overflow-hidden rounded-[8px] shadow-input"
          >
            <input
              type="text"
              name="q"
              aria-label="Search help"
              placeholder="Search our help library"
              className="h-[44px] flex-1 bg-white px-4 text-[15px] text-ink outline-none placeholder:text-ink-3"
            />
            <button
              type="submit"
              className="h-[44px] shrink-0 bg-cta-yellow px-6 text-[14px] font-bold text-ink hover:bg-cta-yellow-hover"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      {/* 2. Quick-action tiles */}
      <section className="mx-auto max-w-[1200px] px-4 py-8">
        <h2 className="text-[21px] font-bold text-ink">What can we help you with?</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <a
              key={t.title}
              href={storePath(store, t.href)}
              className="flex items-start gap-4 rounded-[8px] border border-line bg-white p-5 hover:shadow-[0_1px_2px_rgba(15,17,17,0.15)]"
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[24px]"
                aria-hidden
              >
                {t.icon}
              </span>
              <span>
                <span className="block text-[16px] font-bold text-ink">{t.title}</span>
                <span className="mt-1 block text-[13px] text-ink-2">{t.line}</span>
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* 3. Browse help topics */}
      <section className="bg-surface-band">
        <div className="mx-auto max-w-[1200px] px-4 py-8">
          <h2 className="text-[21px] font-bold text-ink">Browse help topics</h2>
          <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2">
            {HELP_TOPICS.map((topic) => (
              <li key={topic} className="border-b border-line/70 py-2.5">
                <a
                  href={storePath(store, '/s')}
                  className="flex items-center justify-between text-[14px] text-link-teal hover:text-brand-count hover:underline"
                >
                  {topic}
                  <span className="text-ink-3" aria-hidden>
                    ›
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. Common questions */}
      <section className="mx-auto max-w-[1200px] px-4 py-8">
        <h2 className="text-[21px] font-bold text-ink">Common questions</h2>
        <div className="mt-4 divide-y divide-line rounded-[8px] border border-line bg-white">
          {questions.map((item) => (
            <details key={item.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-bold text-ink">
                {item.q}
                <span
                  className="ml-3 text-[18px] text-ink-3 group-open:rotate-180"
                  aria-hidden
                >
                  ⌄
                </span>
              </summary>
              <p className="mt-2 text-[14px] leading-[20px] text-ink-2">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 5. Contact band */}
      <section className="bg-surface-band">
        <div className="mx-auto max-w-[1200px] px-4 py-8">
          <div className="rounded-[8px] border border-line bg-white p-6 sm:p-8">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h2 className="text-[21px] font-bold text-ink">Still need help?</h2>
                <p className="mt-1 text-[14px] text-ink-2">
                  {isIN
                    ? '24x7 help — reach us over chat, phone, or email, whichever suits you.'
                    : 'Available 24/7 — chat with us or get a call from an associate.'}
                </p>
                <p className="mt-1 text-[13px] text-ink-3">
                  {isIN
                    ? `Get help with orders, returns, refunds, and ${store.name} Pay/UPI payments.`
                    : `Get help with orders, returns, refunds, and payments.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="h-[40px] rounded-pill bg-cta-yellow px-6 text-[14px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover"
                >
                  Start chat
                </button>
                <button
                  type="button"
                  className="h-[40px] rounded-pill border border-line bg-white px-6 text-[14px] text-ink hover:bg-surface-2"
                >
                  Call us
                </button>
                {isIN && (
                  <button
                    type="button"
                    className="h-[40px] rounded-pill border border-line bg-white px-6 text-[14px] text-ink hover:bg-surface-2"
                  >
                    Email us
                  </button>
                )}
              </div>
            </div>
            <p className="mt-5 border-t border-line pt-4 text-[12px] text-ink-3">
              This is a demo of {store.name}.{store.hostname.split('.').pop() === 'in' ? 'in' : 'com'}{' '}
              Customer Service. The chat, call{isIN ? ', and email' : ''} buttons are for
              presentation only and do not contact anyone.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

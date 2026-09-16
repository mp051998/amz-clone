import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `Sell on Amazon | Amazon.${store.id === 'IN' ? 'in' : 'com'}` };
}

interface Stat {
  value: string;
  label: string;
}
interface Step {
  title: string;
  body: string;
}
interface Benefit {
  icon: string;
  title: string;
  body: string;
}

export default async function SellPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sym = store.currency.symbol;
  const domain = isIN ? 'Amazon.in' : 'Amazon.com';

  // Fulfilment / Fulfillment spelling differs by store (IN uses British spelling).
  const Fulfil = isIN ? 'Fulfil' : 'Fulfill';
  const fulfil = isIN ? 'fulfil' : 'fulfill';
  const fbaName = isIN ? 'Fulfilment by Amazon (FBA)' : 'Fulfillment by Amazon (FBA)';

  // Faithful selling-plan pricing per store.
  const planLine = isIN ? `at ${sym}25/month* + other fees` : `${sym}39.99 a month + selling fees`;
  const perItemLine = isIN
    ? `${sym}0 to start on select categories — pay only when you sell`
    : `${sym}0.99 per item (Individual) or ${sym}39.99/month (Professional)`;

  const signUpHref = storePath(store, '/signin?new=1');
  const homeHref = storePath(store, '/');

  const stats: Stat[] = isIN
    ? [
        { value: '300M+', label: 'customers worldwide within reach' },
        { value: '14L+', label: 'sellers already growing across India' },
        { value: '19,000+', label: 'pincodes served with Amazon logistics' },
        { value: '200+', label: 'countries via Amazon Global Selling' },
      ]
    : [
        { value: '300M+', label: 'active customer accounts worldwide' },
        { value: '2M+', label: 'selling partners on Amazon' },
        { value: '60%+', label: 'of units sold come from independent sellers' },
        { value: '200+', label: 'countries and regions you can reach' },
      ];

  const steps: Step[] = [
    {
      title: 'Create your account',
      body: isIN
        ? 'Register with your business and GST details, add your bank account, and set up your seller profile in minutes.'
        : 'Register with your business details, add your bank account, and set up your seller profile in minutes.',
    },
    {
      title: 'List your products',
      body: 'Add products one at a time or in bulk. Match to listings that already exist, or create fresh detail pages of your own.',
    },
    {
      title: `Ship and ${fulfil}`,
      body: `${Fulfil} orders yourself, or let ${fbaName} pick, pack, ship, and handle returns and customer service for you.`,
    },
    {
      title: 'Get paid',
      body: isIN
        ? 'Amazon settles your earnings, minus fees, straight to your bank account on a regular 7-day cycle.'
        : 'Amazon deposits your earnings, minus fees, directly to your bank account on a regular schedule.',
    },
  ];

  const benefits: Benefit[] = [
    {
      icon: '🛡️',
      title: 'Brand Registry',
      body: 'Protect your brand and unlock A+ Content, your own Store, and brand-level analytics.',
    },
    {
      icon: '📣',
      title: 'Advertising',
      body: 'Sponsored Products and Sponsored Brands put you in front of shoppers who are ready to buy.',
    },
    {
      icon: '📦',
      title: fbaName,
      body: `Store, pack, and ship with ${fbaName}. Your products become Prime-eligible and ship fast.`,
    },
    {
      icon: '📱',
      title: 'Amazon Seller App',
      body: 'Manage inventory, track sales, and answer customers from your phone, wherever you are.',
    },
    {
      icon: '📊',
      title: 'Analytics',
      body: 'Brand Analytics and business reports show you what sells, where, and how to grow next.',
    },
  ];
  if (isIN) {
    benefits.push({
      icon: '🌍',
      title: 'Amazon Global Selling',
      body: 'Export from India and reach customers in 200+ countries and regions across Amazon marketplaces.',
    });
  }

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="mx-auto max-w-[1500px] px-4 pt-3">
        <nav className="text-[13px] text-ink-3">
          <a href={homeHref} className="text-link-teal hover:text-brand-count hover:underline">
            {store.name}
          </a>
          <span className="mx-1">›</span>
          <span className="text-ink-2">Sell on Amazon</span>
        </nav>
      </div>

      {/* 1. Hero */}
      <section className="relative overflow-hidden bg-nav-main text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-[#232F3E] via-[#131A22] to-[#0b4a49]" aria-hidden />
        <div className="relative mx-auto max-w-[1500px] px-4 py-14 sm:py-20">
          <div className="max-w-[720px]">
            <span className="inline-block rounded-pill bg-white/10 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-brand-search">
              Sell with Amazon
            </span>
            <h1 className="mt-4 text-[36px] font-extrabold leading-[1.05] sm:text-[52px]">
              Come build the future with us.
            </h1>
            <p className="mt-4 max-w-[560px] text-[15px] leading-6 text-white/85 sm:text-[17px]">
              {isIN
                ? `Reach hundreds of millions of customers across India and beyond. Build your brand and grow your business on ${domain} with the tools trusted by lakhs of sellers.`
                : `Reach hundreds of millions of customers, build your brand, and grow your business on ${domain} with the tools trusted by millions of sellers.`}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href={signUpHref}
                className="inline-flex h-[44px] items-center rounded-pill bg-cta-yellow px-8 text-[15px] font-bold text-ink shadow-input transition-colors hover:bg-cta-yellow-hover"
              >
                Sign up
              </a>
              <a
                href="#how-to-start"
                className="inline-flex h-[44px] items-center rounded-pill border border-white/40 bg-white/5 px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/10"
              >
                See how it works
              </a>
            </div>

            <p className="mt-5 text-[14px] font-medium text-white/90">
              Professional selling plan: <span className="text-brand-search">{planLine}</span>
            </p>
            <p className="mt-1 text-[13px] text-white/60">{perItemLine}</p>
          </div>
        </div>
      </section>

      {/* 2. Stats band */}
      <section className="bg-surface-band">
        <div className="mx-auto max-w-[1500px] px-4 py-12">
          <h2 className="text-center text-[22px] font-bold text-ink sm:text-[26px]">
            {isIN ? 'Sell across India — and the world' : 'Reach hundreds of millions of customers'}
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-[8px] border border-line-card bg-white px-5 py-7 text-center shadow-sm"
              >
                <div className="text-[32px] font-extrabold leading-none text-ink sm:text-[38px]">{s.value}</div>
                <div className="mt-2 text-[13px] leading-5 text-ink-2">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. How to start selling */}
      <section id="how-to-start" className="bg-white">
        <div className="mx-auto max-w-[1500px] px-4 py-14">
          <div className="mx-auto max-w-[1000px] text-center">
            <h2 className="text-[24px] font-bold text-ink sm:text-[30px]">How to start selling</h2>
            <p className="mt-2 text-[14px] text-ink-2">Four steps from sign-up to your first sale.</p>
          </div>
          <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="relative rounded-[8px] border border-line bg-surface-3 p-6"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-nav-main text-[16px] font-bold text-white">
                  {i + 1}
                </div>
                <h3 className="mt-4 text-[16px] font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-5 text-ink-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4. Tools & benefits grid */}
      <section className="bg-surface-2">
        <div className="mx-auto max-w-[1500px] px-4 py-14">
          <div className="mx-auto max-w-[1000px] text-center">
            <h2 className="text-[24px] font-bold text-ink sm:text-[30px]">Tools to help you grow</h2>
            <p className="mt-2 text-[14px] text-ink-2">
              {isIN
                ? 'Everything you need to launch, protect, and scale your business — including exporting from India.'
                : 'Everything you need to launch, protect, and scale your business on Amazon.'}
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b) => (
              <div key={b.title} className="rounded-[8px] border border-line-card bg-white p-6 shadow-sm">
                <div className="text-[28px] leading-none" aria-hidden>
                  {b.icon}
                </div>
                <h3 className="mt-3 text-[16px] font-bold text-ink">{b.title}</h3>
                <p className="mt-2 text-[13px] leading-5 text-ink-2">{b.body}</p>
              </div>
            ))}
          </div>

          {isIN ? (
            <p className="mx-auto mt-8 max-w-[1000px] rounded-[8px] border border-line-card bg-white px-5 py-4 text-center text-[13px] text-ink-2">
              New to GST? You can start selling in select categories with{' '}
              <span className="font-bold text-ink">no GST required</span>, and register when you are ready to scale.
            </p>
          ) : null}
        </div>
      </section>

      {/* 5. Closing CTA band */}
      <section className="bg-nav-main text-white">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center gap-5 px-4 py-14 text-center">
          <h2 className="max-w-[720px] text-[26px] font-extrabold leading-tight sm:text-[34px]">
            Ready to reach your next customer?
          </h2>
          <p className="max-w-[560px] text-[14px] text-white/80 sm:text-[15px]">
            Create your seller account today and start listing in minutes.
          </p>
          <a
            href={signUpHref}
            className="inline-flex h-[46px] items-center rounded-pill bg-cta-yellow px-10 text-[15px] font-bold text-ink shadow-input transition-colors hover:bg-cta-yellow-hover"
          >
            Sign up
          </a>
          <p className="text-[13px] text-white/60">
            {planLine}. {perItemLine}.
          </p>
          <p className="mt-2 max-w-[640px] text-[12px] text-white/40">
            Unofficial {domain} clone for demonstration only — not affiliated with, endorsed by, or sponsored by
            Amazon.
          </p>
        </div>
      </section>
    </AppShell>
  );
}

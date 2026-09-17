import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { PrimeLogo } from '@/components/brand/PrimeLogo';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

const PRIME_BLUE = '#00A8E1';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getMarketplace();
  return { title: `Amazon Prime | Amazon.${store.id === 'IN' ? 'in' : 'com'}` };
}

/** The Prime wordmark for the dark hero — white with the smile underneath. */
function PrimeMark() {
  return <PrimeLogo tone="white" className="h-[30px]" />;
}

interface Plan {
  name: string;
  price: string;
  per: string;
  note: string;
  best?: boolean;
}

interface Benefit {
  icon: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}

export default async function PrimePage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sym = store.currency.symbol;

  const joinHref = storePath(store, '/signin?new=1');
  const dealsHref = storePath(store, '/deals');
  const pvHref = storePath(store, '/prime-video');

  const heroPrice = isIN
    ? `${sym}299/month, ${sym}599 for 3 months, or ${sym}1,499/year`
    : `${sym}14.99/month or ${sym}139/year`;

  const plans: Plan[] = isIN
    ? [
        { name: 'Monthly', price: `${sym}299`, per: '/month', note: 'Billed every month. Cancel anytime.' },
        { name: '3 Months', price: `${sym}599`, per: '/3 months', note: `Works out to about ${sym}200 a month.` },
        { name: 'Annual', price: `${sym}1,499`, per: '/year', note: `Best value — only about ${sym}125 a month.`, best: true },
      ]
    : [
        { name: 'Monthly', price: `${sym}14.99`, per: '/month', note: 'Billed every month. Cancel anytime.' },
        { name: 'Annual', price: `${sym}139`, per: '/year', note: `Best value — just ${sym}11.58 a month.`, best: true },
      ];

  const benefits: Benefit[] = [
    {
      icon: '🚚',
      title: 'Fast, FREE delivery',
      body: isIN
        ? 'FREE fast delivery on millions of items, with same-day delivery in select cities.'
        : 'FREE One-Day and Same-Day delivery on millions of eligible items — no order minimum.',
      href: joinHref,
      cta: 'Start saving on delivery',
    },
    {
      icon: '🎬',
      title: 'Prime Video',
      body: 'Stream thousands of movies and shows, plus award-winning Amazon Originals, included with your membership.',
      href: pvHref,
      cta: 'Explore Prime Video',
    },
    {
      icon: '🎵',
      title: isIN ? 'Prime Music' : 'Amazon Music Prime',
      body: isIN
        ? 'Ad-free access to a huge catalogue of songs and playlists, at no extra cost.'
        : 'Shuffle-play 100 million songs and top playlists, ad-free and included with Prime.',
      href: joinHref,
      cta: 'Listen with Prime',
    },
    isIN
      ? {
          icon: '🛍️',
          title: 'Prime shopping deals',
          body: 'Get member-only Lightning Deals 30 minutes early and exclusive prices across the store.',
          href: dealsHref,
          cta: 'Shop deals',
        }
      : {
          icon: '🎮',
          title: 'Prime Gaming',
          body: 'Claim free games, in-game loot, and a free monthly Twitch channel subscription.',
          href: joinHref,
          cta: 'Play with Prime',
        },
    {
      icon: '📚',
      title: 'Prime Reading',
      body: 'Borrow from a rotating catalogue of eBooks, magazines, comics, and more — read on any device.',
      href: joinHref,
      cta: 'Start reading',
    },
    {
      icon: '⚡',
      title: isIN ? 'Great Indian Festival & Prime Day' : 'Prime Day & exclusive deals',
      body: isIN
        ? 'Early access to the Great Indian Festival and Prime Day, plus member-only savings all year.'
        : 'First access to Prime Day, our biggest deal event, plus member-only savings all year long.',
      href: dealsHref,
      cta: 'Shop deals',
    },
  ];

  return (
    <AppShell>
      {/* ---------- Hero ---------- */}
      <section
        className="text-white"
        style={{ background: `linear-gradient(135deg, ${PRIME_BLUE} 0%, #0b466b 52%, #232F3E 100%)` }}
      >
        <div className="mx-auto grid max-w-[1500px] items-center gap-8 px-4 py-12 sm:py-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="mb-4"><PrimeMark /></div>
            <h1 className="max-w-[640px] text-[34px] font-extrabold leading-[1.05] sm:text-[48px]">
              Everything you love about Prime
            </h1>
            <p className="mt-3 max-w-[560px] text-[16px] leading-6 text-white/90 sm:text-[19px]">
              Fast, free delivery, award-winning entertainment, and more — all in one membership.
            </p>
            <ul className="mt-5 grid max-w-[540px] grid-cols-1 gap-x-6 gap-y-2 text-[14px] text-white/90 sm:grid-cols-2">
              {[
                'Fast, FREE delivery',
                'Prime Video included',
                isIN ? 'Ad-free Prime Music' : 'Amazon Music Prime',
                'Exclusive member deals',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full text-[12px] font-bold text-[#0b466b]" style={{ background: PRIME_BLUE }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <a
                href={joinHref}
                className="rounded-pill bg-cta-yellow px-8 py-3 text-[15px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover"
              >
                Join Prime
              </a>
              <span className="text-[14px] text-white/90">{heroPrice}</span>
            </div>
            <p className="mt-2 text-[12px] text-white/70">Cancel anytime. Terms apply.</p>
          </div>

          {/* Membership price card */}
          <div className="rounded-[8px] bg-white p-6 text-ink shadow-dropdown">
            <p className="text-[13px] font-bold uppercase tracking-wide text-ink-2">Prime membership</p>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="text-[40px] font-extrabold leading-none" style={{ color: '#0b466b' }}>{plans[0].price}</span>
              <span className="text-[16px] font-medium text-ink-2">{plans[0].per}</span>
            </p>
            <p className="mt-1 text-[13px] text-ink-2">
              {isIN ? `or ${sym}1,499/year — the best value.` : `or ${sym}139/year — the best value.`}
            </p>
            <a
              href={joinHref}
              className="mt-4 block rounded-pill bg-cta-yellow py-2.5 text-center text-[15px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover"
            >
              Join Prime
            </a>
            <p className="mt-3 text-center text-[13px]">
              <a href={joinHref} className="text-link-teal hover:text-brand-count hover:underline">
                {isIN ? `Students & young adults: try Prime Lite for ${sym}799/year` : `Students: get Prime Student at half price`}
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Benefits grid ---------- */}
      <section className="mx-auto max-w-[1500px] px-4 py-12">
        <h2 className="text-[26px] font-bold text-ink">Your Prime membership includes</h2>
        <p className="mt-1 text-[15px] text-ink-2">One membership, benefits across shopping and entertainment.</p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <div key={b.title} className="flex flex-col rounded-[8px] border border-line bg-white p-5 transition hover:shadow-dropdown">
              <div
                className="grid h-12 w-12 place-items-center rounded-full text-[24px]"
                style={{ background: 'rgba(0,168,225,0.12)' }}
              >
                <span aria-hidden>{b.icon}</span>
              </div>
              <h3 className="mt-4 text-[17px] font-bold text-ink">{b.title}</h3>
              <p className="mt-1 flex-1 text-[14px] leading-5 text-ink-2">{b.body}</p>
              <a href={b.href} className="mt-3 text-[14px] font-medium text-link-teal hover:text-brand-count hover:underline">
                {b.cta} ›
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Plan / pricing cards ---------- */}
      <section className="bg-surface-band py-12">
        <div className="mx-auto max-w-[1100px] px-4">
          <div className="text-center">
            <h2 className="text-[26px] font-bold text-ink">Choose the plan that fits you</h2>
            <p className="mt-1 text-[15px] text-ink-2">Every plan includes all Prime benefits. Cancel anytime.</p>
          </div>
          <div className={`mt-8 grid grid-cols-1 gap-5 ${isIN ? 'md:grid-cols-3' : 'md:grid-cols-2 md:mx-auto md:max-w-[720px]'}`}>
            {plans.map((p) => (
              <div
                key={p.name}
                className={`relative flex flex-col rounded-[8px] bg-white p-6 ${
                  p.best ? 'shadow-dropdown ring-2' : 'border border-line'
                }`}
                style={p.best ? { boxShadow: `0 1px 3px rgba(0,0,0,0.2)`, ['--tw-ring-color' as string]: PRIME_BLUE } : undefined}
              >
                {p.best ? (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
                    style={{ background: PRIME_BLUE }}
                  >
                    Best value
                  </span>
                ) : null}
                <p className="text-[14px] font-bold uppercase tracking-wide text-ink-2">{p.name}</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-[34px] font-extrabold leading-none text-ink">{p.price}</span>
                  <span className="text-[15px] font-medium text-ink-2">{p.per}</span>
                </p>
                <p className="mt-2 flex-1 text-[13px] leading-5 text-ink-2">{p.note}</p>
                <a
                  href={joinHref}
                  className="mt-5 block rounded-pill bg-cta-yellow py-2.5 text-center text-[15px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover"
                >
                  Join
                </a>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[13px] text-ink-2">
            {isIN ? (
              <>Looking for a lighter plan? <a href={joinHref} className="text-link-teal hover:text-brand-count hover:underline">Prime Lite is {sym}799/year.</a></>
            ) : (
              <>Enrolled in college? <a href={joinHref} className="text-link-teal hover:text-brand-count hover:underline">Prime Student is half price at {sym}7.49/month or {sym}69/year.</a></>
            )}
          </p>
        </div>
      </section>

      {/* ---------- Prime Day / Festival band ---------- */}
      <section
        className="text-white"
        style={{ background: `linear-gradient(90deg, #232F3E 0%, #0b466b 60%, ${PRIME_BLUE} 100%)` }}
      >
        <div className="mx-auto flex max-w-[1500px] flex-col items-start gap-5 px-4 py-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-[720px]">
            <p className="text-[13px] font-bold uppercase tracking-[0.15em] text-white/70">Members only</p>
            <h2 className="mt-2 text-[28px] font-extrabold leading-tight sm:text-[34px]">
              {isIN ? 'Early access to Prime Day & the Great Indian Festival' : 'Get first access to Prime Day'}
            </h2>
            <p className="mt-2 max-w-[620px] text-[15px] leading-6 text-white/90">
              {isIN
                ? 'Prime members shop the Great Indian Festival and Prime Day deals before anyone else, plus exclusive member prices all year round.'
                : 'Prime members get early access to Prime Day, our biggest shopping event of the year, plus member-only deals every day.'}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <a
              href={joinHref}
              className="rounded-pill bg-cta-yellow px-8 py-3 text-center text-[15px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover"
            >
              Join Prime
            </a>
            <a href={dealsHref} className="text-center text-[14px] text-white/90 underline-offset-2 hover:underline">
              Shop today&apos;s deals ›
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Closing CTA band ---------- */}
      <section className="bg-nav-main text-white">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center gap-4 px-4 py-14 text-center">
          <div><PrimeMark /></div>
          <h2 className="text-[28px] font-extrabold sm:text-[34px]">Ready to start saving?</h2>
          <p className="max-w-[560px] text-[15px] leading-6 text-white/85">
            Join millions of members enjoying fast delivery, entertainment, and exclusive deals.
          </p>
          <a
            href={joinHref}
            className="rounded-pill bg-cta-yellow px-10 py-3 text-[16px] font-bold text-ink shadow-input hover:bg-cta-yellow-hover"
          >
            Join Prime
          </a>
          <p className="text-[14px] text-white/80">{heroPrice}</p>
          <p className="text-[12px] text-white/60">
            Cancel anytime. Unofficial clone for demonstration — not affiliated with Amazon or Amazon Prime.
          </p>
        </div>
      </section>
    </AppShell>
  );
}

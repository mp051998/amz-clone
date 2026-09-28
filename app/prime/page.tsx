import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, InfoCard, TextLink, DemoNote, PlusBadge, cardGrid } from '@/components/brand/Page';
import { Kicker, TopPickBadge } from '@/components/decision/Badges';
import { CheckList } from '@/components/decision/CheckList';
import { buttonClasses } from '@/components/primitives/Button';
import { cn } from '@/components/lib/cn';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: 'Plus membership · Store' };

interface Plan {
  name: string;
  price: string;
  per: string;
  note: string;
  best?: boolean;
}

interface Benefit {
  title: string;
  body: string;
  href: string;
  cta: string;
}

export default async function PlusPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sym = store.currency.symbol;

  const joinHref = storePath(store, '/signin?new=1');
  const dealsHref = storePath(store, '/deals');
  const videoHref = storePath(store, '/prime-video');

  const heroPrice = isIN
    ? `${sym}299/month, ${sym}599 for 3 months, or ${sym}1,499/year`
    : `${sym}14.99/month or ${sym}139/year`;

  const plans: Plan[] = isIN
    ? [
        { name: 'Monthly', price: `${sym}299`, per: '/month', note: 'Billed every month. Cancel anytime.' },
        { name: '3 months', price: `${sym}599`, per: '/3 months', note: `Works out to about ${sym}200 a month.` },
        { name: 'Annual', price: `${sym}1,499`, per: '/year', note: `About ${sym}125 a month — the lowest monthly cost.`, best: true },
      ]
    : [
        { name: 'Monthly', price: `${sym}14.99`, per: '/month', note: 'Billed every month. Cancel anytime.' },
        { name: 'Annual', price: `${sym}139`, per: '/year', note: `Just ${sym}11.58 a month — the lowest monthly cost.`, best: true },
      ];

  const benefits: Benefit[] = [
    {
      title: 'Fast, free delivery',
      body: isIN
        ? 'Free fast delivery on millions of items, with same-day delivery in select cities.'
        : 'Free one-day and same-day delivery on millions of eligible items, with no order minimum.',
      href: dealsHref,
      cta: 'Shop eligible items',
    },
    {
      title: 'Plus Video',
      body: 'Stream thousands of movies and series, plus original shows, included with your membership.',
      href: videoHref,
      cta: 'Browse Plus Video',
    },
    {
      title: 'Ad-free music',
      body: isIN
        ? 'Ad-free access to a large catalogue of songs and playlists, at no extra cost.'
        : 'Shuffle-play millions of songs and top playlists, ad-free and included.',
      href: joinHref,
      cta: 'Start listening',
    },
    isIN
      ? { title: 'Early deal access', body: 'Member-only deals open 30 minutes early, plus exclusive prices across the store.', href: dealsHref, cta: "See today's deals" }
      : { title: 'Games & extras', body: 'Claim free games and in-game extras every month.', href: joinHref, cta: 'See this month' },
    {
      title: 'Reading',
      body: 'Borrow from a rotating catalogue of eBooks, magazines and comics, on any device.',
      href: joinHref,
      cta: 'Start reading',
    },
    {
      title: isIN ? 'Festival sale access' : 'Members’ sale days',
      body: isIN
        ? 'Shop the big festival sales before everyone else, plus member-only savings all year.'
        : 'First access to our biggest sale days, plus member-only savings all year long.',
      href: dealsHref,
      cta: "See today's deals",
    },
  ];

  return (
    <AppShell>
      <Page>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
          <PageHead
            kicker="Delivery · video · member deals"
            title={<span className="inline-flex flex-wrap items-center gap-3"><PlusBadge className="px-2 py-0.5 text-[clamp(16px,2vw,20px)]" /> membership</span>}
            actions={
              <>
                <a href={joinHref} className={buttonClasses({ variant: 'primary', size: 'lg' })}>Join Plus</a>
                <a href="#plans" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>Compare plans</a>
              </>
            }
          >
            <p className="m-0">Fast, free delivery, entertainment and member-only savings — one membership. Worth it if you order more than a couple of times a month.</p>
            <p className="m-0 mt-2 text-[14px] text-ink-3">{heroPrice} · Cancel anytime.</p>
          </PageHead>

          <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-5">
            <Kicker>What you get</Kicker>
            <CheckList
              size="md"
              good={['Fast, free delivery', 'Plus Video included', 'Ad-free music', 'Member-only deals']}
            />
            <p className="m-0 border-t border-line-2 pt-3 text-[14px] text-ink-2">
              From <strong className="text-[18px] font-bold text-ink tabular-nums">{plans[0].price}</strong>{plans[0].per}
            </p>
          </div>
        </div>

        <Section title="What's included" note="One membership, benefits across shopping and entertainment">
          <div className={cardGrid}>
            {benefits.map((b) => (
              <InfoCard key={b.title} title={b.title} footer={<TextLink href={b.href}>{b.cta}</TextLink>}>
                {b.body}
              </InfoCard>
            ))}
          </div>
        </Section>

        <Section id="plans" title="Choose a plan" note="Every plan includes every benefit">
          <div className={cn('grid gap-3.5', isIN ? 'md:grid-cols-3' : 'md:max-w-[760px] md:grid-cols-2')}>
            {plans.map((p) => (
              <div
                key={p.name}
                className={cn(
                  'flex flex-col gap-2 rounded-card bg-surface p-[18px]',
                  p.best ? 'border-[1.5px] border-ink' : 'border border-line',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Kicker>{p.name}</Kicker>
                  {p.best ? <TopPickBadge>Best value</TopPickBadge> : null}
                </div>
                <p className="m-0 flex items-baseline gap-1">
                  <span className="text-[32px] font-bold leading-none tracking-[-0.01em] text-ink tabular-nums">{p.price}</span>
                  <span className="text-[15px] text-ink-2">{p.per}</span>
                </p>
                <p className="m-0 flex-1 text-[14px] text-ink-2">{p.note}</p>
                <a href={joinHref} className={cn('mt-2', buttonClasses({ variant: p.best ? 'primary' : 'secondary', block: true }))}>
                  Choose {p.name.toLowerCase()}
                </a>
              </div>
            ))}
          </div>
          <p className="m-0 text-[14px] text-ink-2">
            {isIN ? (
              <>Want something lighter? <a href={joinHref} className="font-semibold text-ink underline underline-offset-2 hover:text-accent-ink">Plus Lite is {sym}799/year</a> with delivery benefits only.</>
            ) : (
              <>At college? <a href={joinHref} className="font-semibold text-ink underline underline-offset-2 hover:text-accent-ink">Plus Student is half price</a> at {sym}7.49/month or {sym}69/year.</>
            )}
          </p>
        </Section>

        <section className="flex flex-col items-start gap-4 rounded-panel bg-ink px-5 py-6 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex max-w-[680px] flex-col gap-2">
            <Kicker tone="onDark">Members only</Kicker>
            <h2 className="m-0 text-[20px] font-semibold leading-tight text-white">
              {isIN ? 'Shop the festival sales before everyone else' : 'Get first access to our biggest sale days'}
            </h2>
            <p className="m-0 text-[14px] leading-relaxed text-white/80">
              Early access plus member-only prices all year. Deals still show their real list price, so you can judge the saving yourself.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <a href={joinHref} className={buttonClasses({ variant: 'primary' })}>Join Plus</a>
            <a href={dealsHref} className="inline-flex min-h-11 items-center px-2 text-[14px] font-semibold text-white underline underline-offset-2 hover:text-accent-soft">
              Today&apos;s deals →
            </a>
          </div>
        </section>

        <DemoNote>Plus is a demo membership in an unofficial portfolio store. Joining creates a test account only; nothing is billed and no benefits are delivered.</DemoNote>
      </Page>
    </AppShell>
  );
}

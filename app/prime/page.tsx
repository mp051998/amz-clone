import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, InfoCard, TextLink, DemoNote, PlusBadge, cardGrid } from '@/components/brand/Page';
import { Kicker, TopPickBadge } from '@/components/decision/Badges';
import { CheckList } from '@/components/decision/CheckList';
import { buttonClasses } from '@/components/primitives/Button';
import { cn } from '@/components/lib/cn';
import { Alert } from '@/components/primitives/Alert';
import { JoinPlusButton, LeavePlusButton } from '@/components/prime/PlusMembership';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { plusMembership } from '@/lib/data/plus';

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
  /** where the card leads; benefits that only sell the membership drop it once signed in */
  href: string | null;
  cta: string;
}

export default async function PlusPage({ searchParams }: { searchParams: Promise<{ joined?: string; left?: string }> }) {
  const [store, user, sp] = await Promise.all([getMarketplace(), readUser(), searchParams]);
  const plus = user ? await plusMembership(await db()) : null;
  const isIN = store.id === 'IN';
  const sym = store.currency.symbol;

  // signed out, joining starts with an account; signed in, the join buttons join at once
  const joinHref = user ? null : storePath(store, '/signin?new=1&next=/prime');
  const dealsHref = storePath(store, '/deals');
  const videoHref = storePath(store, '/prime-video');

  const memberSince = plus
    ? new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone }).format(new Date(plus.since))
    : '';
  /** A join call to action: sign up first when signed out, join at once when signed in. */
  const join = (label: string, opts: { variant?: 'primary' | 'secondary'; size?: 'lg'; block?: boolean } = {}) =>
    joinHref ? (
      <a href={joinHref} className={buttonClasses({ variant: opts.variant ?? 'primary', size: opts.size, block: opts.block })}>{label}</a>
    ) : (
      <JoinPlusButton label={label} variant={opts.variant ?? 'primary'} size={opts.size} block={opts.block} />
    );
  const joinText = (children: ReactNode) =>
    joinHref ? <a href={joinHref} className="font-semibold text-ink underline underline-offset-2 hover:text-accent-ink">{children}</a> : <strong className="font-semibold text-ink">{children}</strong>;

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
        ? 'FREE delivery on every order, with no minimum, and FREE same-day or one-day delivery whenever checkout offers it.'
        : 'FREE delivery on every order with no minimum, plus FREE same-day and one-day delivery whenever checkout offers it.',
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
        {sp.joined && plus ? <Alert tone="success">Welcome to Plus. FREE delivery and FREE faster delivery are on for your next orders.</Alert> : null}
        {sp.left && !plus ? <Alert tone="info">Your Plus membership has ended. Orders you&apos;ve placed keep their delivery; new ones are charged as usual.</Alert> : null}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
          <PageHead
            kicker="Delivery · video · member deals"
            title={<span className="inline-flex flex-wrap items-center gap-3"><PlusBadge className="px-2 py-0.5 text-[clamp(16px,2vw,20px)]" /> membership</span>}
            actions={
              plus ? (
                <>
                  <a href={dealsHref} className={buttonClasses({ variant: 'primary', size: 'lg' })}>Shop today&apos;s deals</a>
                  <LeavePlusButton />
                </>
              ) : (
                <>
                  {join('Join Plus', { size: 'lg' })}
                  <a href="#plans" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>Compare plans</a>
                </>
              )
            }
          >
            {plus ? (
              <>
                <p className="m-0">You&apos;re a Plus member since {memberSince}. FREE delivery on every order and FREE faster delivery are on, in both stores.</p>
                <p className="m-0 mt-2 text-[14px] text-ink-3">Nothing is billed in this demo store. End the membership any time.</p>
              </>
            ) : (
              <>
                <p className="m-0">Fast, free delivery, entertainment and member-only savings — one membership. Worth it if you order more than a couple of times a month.</p>
                <p className="m-0 mt-2 text-[14px] text-ink-3">{heroPrice} · Cancel anytime.</p>
              </>
            )}
          </PageHead>

          <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-5">
            <Kicker>What you get</Kicker>
            <CheckList
              size="md"
              good={['Fast, free delivery', 'Plus Video included', 'Ad-free music', 'Member-only deals']}
            />
            <p className="m-0 border-t border-line-2 pt-3 text-[14px] text-ink-2">
              {plus ? (
                <>Member since <strong className="font-semibold text-ink">{memberSince}</strong></>
              ) : (
                <>From <strong className="text-[18px] font-bold text-ink tabular-nums">{plans[0].price}</strong>{plans[0].per}</>
              )}
            </p>
          </div>
        </div>

        <Section title="What's included" note="One membership, benefits across shopping and entertainment">
          <div className={cardGrid}>
            {benefits.map((b) => (
              <InfoCard key={b.title} title={b.title} footer={b.href ? <TextLink href={b.href}>{b.cta}</TextLink> : undefined}>
                {b.body}
              </InfoCard>
            ))}
          </div>
        </Section>

        {plus ? null : (
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
                  <div className="mt-2 flex">{join(`Choose ${p.name.toLowerCase()}`, { variant: p.best ? 'primary' : 'secondary', block: true })}</div>
                </div>
              ))}
            </div>
            <p className="m-0 text-[14px] text-ink-2">
              {isIN ? (
                <>Want something lighter? {joinText(<>Plus Lite is {sym}799/year</>)} with delivery benefits only.</>
              ) : (
                <>At college? {joinText('Plus Student is half price')} at {sym}7.49/month or {sym}69/year.</>
              )}
            </p>
          </Section>
        )}

        <section className="flex flex-col items-start gap-4 rounded-panel bg-ink px-5 py-6 text-on-ink sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex max-w-[680px] flex-col gap-2">
            <Kicker tone="onDark">Members only</Kicker>
            <h2 className="m-0 text-[20px] font-semibold leading-tight text-on-ink">
              {isIN ? 'Shop the festival sales before everyone else' : 'Get first access to our biggest sale days'}
            </h2>
            <p className="m-0 text-[14px] leading-relaxed text-on-ink/80">
              Early access plus member-only prices all year. Deals still show their real list price, so you can judge the saving yourself.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {plus ? null : join('Join Plus')}
            <a href={dealsHref} className="inline-flex min-h-11 items-center px-2 text-[14px] font-semibold text-on-ink underline underline-offset-2 hover:text-accent-soft">
              Today&apos;s deals →
            </a>
          </div>
        </section>

        <DemoNote>
          Plus is a demo membership in an unofficial portfolio store and nothing is billed. Members really get FREE delivery and FREE
          faster delivery on their orders here; the video, music, reading and games benefits are illustrations only.
        </DemoNote>
      </Page>
    </AppShell>
  );
}

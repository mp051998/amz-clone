import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, Card, InfoCard, DemoNote, cardGrid } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { CheckList } from '@/components/decision/CheckList';
import { buttonClasses } from '@/components/primitives/Button';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: 'Sell with us · Store' };

interface Step { title: string; body: string }
interface Benefit { title: string; body: string }

export default async function SellPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sym = store.currency.symbol;

  // Fulfilment / Fulfillment spelling differs by store (IN uses British spelling).
  const Fulfil = isIN ? 'Fulfil' : 'Fulfill';
  const fulfil = isIN ? 'fulfil' : 'fulfill';
  const fulfilment = isIN ? 'Fulfilment by Store' : 'Fulfillment by Store';

  const planLine = isIN ? `${sym}25/month* + other fees` : `${sym}39.99/month + selling fees`;
  const perItemLine = isIN
    ? `${sym}0 to start on select categories — pay only when you sell`
    : `${sym}0.99 per item on the Individual plan`;

  const signUpHref = storePath(store, '/signin?new=1');

  const steps: Step[] = [
    {
      title: 'Create your account',
      body: isIN
        ? 'Register with your business and GST details, add your bank account, and set up your seller profile.'
        : 'Register with your business details, add your bank account, and set up your seller profile.',
    },
    { title: 'List your products', body: 'Add products one at a time or in bulk — match an existing listing, or create your own page.' },
    { title: `Ship and ${fulfil}`, body: `${Fulfil} orders yourself, or let ${fulfilment} pick, pack, ship and handle returns for you.` },
    {
      title: 'Get paid',
      body: isIN
        ? 'Earnings, minus fees, are settled to your bank account on a regular 7-day cycle.'
        : 'Earnings, minus fees, are deposited to your bank account on a regular schedule.',
    },
  ];

  const benefits: Benefit[] = [
    { title: 'Honest listings rank better', body: 'Shoppers here rank by what matters to them. Complete specs and clear trade-offs help the right buyers find you.' },
    { title: 'Brand protection', body: 'Register your brand to control your product pages and see brand-level analytics.' },
    { title: fulfilment, body: `Store, pack and ship with us. Your products become eligible for free fast delivery for Plus members.` },
    { title: 'Seller app', body: 'Manage inventory, track sales and answer customers from your phone.' },
    { title: 'Sales analytics', body: 'See what sells, where, and which attributes shoppers compare you on.' },
  ];
  if (isIN) {
    benefits.push({ title: 'Global selling', body: 'Export from India and reach customers in other stores from the same account.' });
  }

  return (
    <AppShell>
      <Page>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
          <PageHead
            kicker="Sell with us"
            title="Reach shoppers who know what they want"
            actions={
              <>
                <a href={signUpHref} className={buttonClasses({ variant: 'primary', size: 'lg' })}>Start selling</a>
                <a href="#how-to-start" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>How it works</a>
              </>
            }
          >
            {isIN
              ? 'Shoppers across India come here with priorities and a budget. List your products, show what they’re good at, and let the match do the work.'
              : 'Shoppers come here with priorities and a budget. List your products, show what they’re good at, and let the match do the work.'}
          </PageHead>

          <Card className="flex flex-col gap-3">
            <Kicker>What it costs</Kicker>
            <p className="m-0 text-[15px] text-ink">
              <strong className="font-semibold">Professional plan:</strong> <span className="tabular-nums">{planLine}</span>
            </p>
            <p className="m-0 text-[14px] text-ink-2">{perItemLine}</p>
            <CheckList
              className="border-t border-line-2 pt-3"
              good={['No setup fee', 'Cancel the plan anytime', isIN ? 'Start in select categories without GST' : 'Switch plans as you grow']}
            />
          </Card>
        </div>

        <Section id="how-to-start" title="How to start selling" note="Four steps from sign-up to your first sale">
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (<InfoCard key={s.title} index={`Step ${i + 1}`} title={s.title}>{s.body}</InfoCard>))}
          </div>
        </Section>

        <Section title="Tools to help you grow">
          <div className={cardGrid}>
            {benefits.map((b) => (<InfoCard key={b.title} title={b.title}>{b.body}</InfoCard>))}
          </div>
        </Section>

        <section className="flex flex-col items-start gap-4 rounded-panel bg-ink px-5 py-6 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex max-w-[640px] flex-col gap-2">
            <Kicker tone="onDark">Ready when you are</Kicker>
            <h2 className="m-0 text-[20px] font-semibold leading-tight text-white">Create your seller account and list in minutes</h2>
            <p className="m-0 text-[14px] text-white/80">{planLine}. {perItemLine}.</p>
          </div>
          <a href={signUpHref} className={buttonClasses({ variant: 'primary' })}>Start selling</a>
        </section>

        <DemoNote>Demo store — seller plans and fees are illustrative; signing up creates a test shopper account only.</DemoNote>
      </Page>
    </AppShell>
  );
}

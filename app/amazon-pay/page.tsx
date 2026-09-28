import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, InfoCard, DemoNote, cardGrid } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { buttonClasses } from '@/components/primitives/Button';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

export const metadata: Metadata = { title: 'Store Pay · Store' };

interface Tile { title: string; desc: string }

/** IN — quick actions. */
const IN_ACTIONS = ['Scan any QR', 'Send money', 'To bank / UPI ID', 'Pay balance'];

/** IN — recharges & bill payments. */
const IN_BILLS = [
  'Mobile recharge', 'Electricity', 'DTH', 'Broadband', 'Credit card bill', 'Gas cylinder',
  'Water', 'FASTag recharge', 'Municipal tax', 'App store credit', 'Rent', 'Loan repayment',
];

/** IN — financial services. */
const IN_FINANCE: Tile[] = [
  { title: 'Pay Later', desc: 'Buy now, pay next month or convert to easy EMIs — instant activation, no paperwork.' },
  { title: 'Insurance', desc: 'Car, bike, health and term-life cover in minutes, with instant policy documents.' },
  { title: 'Digital gold', desc: 'Buy 24K 99.9% pure digital gold from ₹1, stored securely and sellable anytime.' },
];

const US_SERVICES: Tile[] = [
  { title: 'Faster checkout', desc: 'Use the addresses and payment methods already in your store account on other sites and apps.' },
  { title: 'Card details stay private', desc: 'Merchants never see your card number — we pass a token instead.' },
  { title: 'Purchase protection', desc: 'Eligible purchases on participating merchants are covered if something goes wrong.' },
  { title: 'Store balance', desc: 'Reload your balance and shop with gift-card funds across the store.' },
  { title: 'Shop with points', desc: 'Redeem eligible rewards points toward your order at checkout.' },
  { title: 'One place to manage', desc: 'See every transaction and manage payment methods in your account.' },
];

/** Plain tile for the IN action / bill grids: label only, 64px tall, bordered. */
function ActionTile({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} className="flex min-h-16 items-center justify-center rounded-card border border-line bg-surface px-2 py-3 text-center text-[14px] font-medium leading-tight text-ink no-underline transition-colors hover:border-ink">
      {label}
    </a>
  );
}

export default async function StorePayPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sp = (p: string) => storePath(store, p);
  const startHref = sp('/signin?new=1');

  return (
    <AppShell>
      <Page>
        <PageHead
          kicker="Store Pay · payments"
          title={isIN ? 'UPI, bills and recharges in one place' : 'Check out faster, wherever you shop'}
          actions={
            <>
              <a href={startHref} className={buttonClasses({ variant: 'primary', size: 'lg' })}>{isIN ? 'Get started' : 'Set up Store Pay'}</a>
              <a href={sp('/deals')} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>Shop deals</a>
            </>
          }
        >
          {isIN
            ? 'Send money over UPI, pay your bills, recharge in seconds, and earn cashback — all with your store account.'
            : 'Use the payment methods and addresses already in your store account to get through checkout on other sites and apps.'}
        </PageHead>

        {isIN ? (
          <>
            <Section title="Quick actions">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {IN_ACTIONS.map((a) => (<ActionTile key={a} label={a} href={startHref} />))}
              </div>
            </Section>

            <Section title="Recharges & bill payments" note="Earn balance cashback on every bill">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {IN_BILLS.map((a) => (<ActionTile key={a} label={a} href={startHref} />))}
              </div>
            </Section>

            <Section title="Financial services">
              <div className={cardGrid}>
                {IN_FINANCE.map((s) => (<InfoCard key={s.title} title={s.title}>{s.desc}</InfoCard>))}
              </div>
            </Section>
          </>
        ) : (
          <Section title="Why use Store Pay">
            <div className={cardGrid}>
              {US_SERVICES.map((s) => (<InfoCard key={s.title} title={s.title}>{s.desc}</InfoCard>))}
            </div>
          </Section>
        )}

        <section className="grid items-center gap-5 rounded-panel border border-line bg-surface p-5 sm:p-7 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <h2 className="m-0 text-[22px] font-semibold leading-tight text-ink">
              {isIN ? 'Cashback on every payment' : 'Rewards with the store card'}
            </h2>
            <p className="m-0 max-w-[560px] text-[15px] leading-relaxed text-ink-2">
              {isIN
                ? 'Earn balance cashback on recharges, bill payments and shopping. Pair it with the store credit card for up to 5% back as a Plus member.'
                : 'Plus members earn 5% back with the store card on store purchases, plus rewards everywhere the card is accepted — no annual fee.'}
            </p>
            <div className="mt-2">
              <a href={startHref} className={buttonClasses({ variant: 'dark' })}>{isIN ? 'Activate Store Pay' : 'Learn about the card'}</a>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 rounded-card bg-surface-2 p-6 text-center">
            <Kicker>Plus members</Kicker>
            <span className="text-[40px] font-bold leading-none tracking-[-0.01em] text-good tabular-nums">{isIN ? 'up to 5%' : '5%'}</span>
            <span className="text-[14px] text-ink-2">{isIN ? 'cashback' : 'back on store purchases'}</span>
          </div>
        </section>

        <DemoNote>Demo store — payment services are illustrative; no money moves and no card is issued.</DemoNote>
      </Page>
    </AppShell>
  );
}

import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, Card, InfoCard, DemoNote, TextLink, cardGrid } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { storeBalance } from '@/lib/data/balance';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Store Pay · Store' };

interface Tile { title: string; desc: string; /** a real page of this demo */ href?: string }

/** IN — quick actions; the balance one is real (gift card balance). */
const IN_ACTIONS: { label: string; href?: string }[] = [
  { label: 'Scan any QR' }, { label: 'Send money' }, { label: 'To bank / UPI ID' }, { label: 'Pay balance', href: '/gift-cards#balance' },
];

/** IN — recharges & bill payments; mobile recharge and the billers with a page (`BILL_CATEGORIES`) are real. */
const IN_BILLS: { label: string; href?: string }[] = [
  { label: 'Mobile recharge', href: '/amazon-pay/recharge' }, { label: 'Electricity', href: '/amazon-pay/bills/electricity' },
  { label: 'DTH', href: '/amazon-pay/bills/dth' }, { label: 'Broadband', href: '/amazon-pay/bills/broadband' },
  { label: 'Piped gas', href: '/amazon-pay/bills/gas' }, { label: 'Water', href: '/amazon-pay/bills/water' },
  { label: 'FASTag recharge', href: '/amazon-pay/bills/fastag' }, { label: 'Credit card bill' }, { label: 'Gas cylinder' },
  { label: 'Municipal tax' }, { label: 'Rent' }, { label: 'Loan repayment' },
];

/** IN — financial services; Pay Later is real. */
const IN_FINANCE: Tile[] = [
  { title: 'Pay Later', desc: 'Buy now, pay next month with no interest — instant activation, no paperwork.', href: '/amazon-pay/later' },
  { title: 'Insurance', desc: 'Car, bike, health and term-life cover in minutes, with instant policy documents.' },
  { title: 'Digital gold', desc: 'Buy 24K 99.9% pure digital gold from ₹1, stored securely and sellable anytime.' },
];

const US_SERVICES: Tile[] = [
  { title: 'Faster checkout', desc: 'Use the addresses and payment methods already in your store account on other sites and apps.' },
  { title: 'Card details stay private', desc: 'Merchants never see your card number — we pass a token instead.' },
  { title: 'Purchase protection', desc: 'Eligible purchases on participating merchants are covered if something goes wrong.' },
  { title: 'Store balance', desc: 'Redeem gift cards into your balance and pay with it at checkout across the store.', href: '/gift-cards#balance' },
  { title: 'Shop with points', desc: 'Redeem eligible rewards points toward your order at checkout.' },
  { title: 'One place to manage', desc: 'See every transaction and manage payment methods in your account.' },
];

const tileClass = 'flex min-h-16 items-center justify-center rounded-card border border-line bg-surface px-2 py-3 text-center text-[14px] font-medium leading-tight text-ink';

/**
 * Plain tile for the IN action / bill grids: label only, 64px tall, bordered. Without a link it's
 * illustrative: a signed-in shopper sees it as a plain tile, not a link back to sign-up.
 */
function ActionTile({ label, href }: { label: string; href: string | null }) {
  if (!href) return <div className={`${tileClass} text-ink-2`}>{label}</div>;
  return (
    <a href={href} className={`${tileClass} no-underline transition-colors hover:border-ink`}>
      {label}
    </a>
  );
}

export default async function StorePayPage() {
  const store = await getMarketplace();
  const isIN = store.id === 'IN';
  const sp = (p: string) => storePath(store, p);
  const user = await readUser();
  const balance = user ? await storeBalance(await db(), store.id).catch(() => null) : null;
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const balanceHref = sp('/gift-cards#balance');
  // signed out, the illustrative services lead to sign-up; signed in there's nothing more to set up
  const signupHref = sp(`/signin?new=1&next=${encodeURIComponent('/amazon-pay')}`);
  const startHref = user ? null : signupHref;

  return (
    <AppShell>
      <Page>
        <PageHead
          kicker="Store Pay · payments"
          title={isIN ? 'UPI, bills and recharges in one place' : 'Check out faster, wherever you shop'}
          actions={
            <>
              {startHref ? (
                <a href={startHref} className={buttonClasses({ variant: 'primary', size: 'lg' })}>{isIN ? 'Get started' : 'Set up Store Pay'}</a>
              ) : (
                <a href={balanceHref} className={buttonClasses({ variant: 'primary', size: 'lg' })}>{isIN ? 'Add to your balance' : 'Manage your balance'}</a>
              )}
              <a href={sp('/deals')} className={buttonClasses({ variant: 'secondary', size: 'lg' })}>Shop deals</a>
            </>
          }
        >
          {isIN
            ? 'Send money over UPI, pay your bills, recharge in seconds, and earn cashback — all with your store account.'
            : 'Use the payment methods and addresses already in your store account to get through checkout on other sites and apps.'}
        </PageHead>

        {user ? (
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Kicker>{isIN ? 'Store Pay balance' : 'Your store balance'}</Kicker>
              {balance !== null ? (
                <p className="m-0 text-[32px] font-bold leading-none tracking-[-0.01em] tabular-nums">{money(balance)}</p>
              ) : (
                <p className="m-0 text-[14px] text-ink-2">Your balance can’t be shown right now. Try again in a moment.</p>
              )}
              <p className="m-0 text-[14px] text-ink-2">
                Pay with it at checkout ({isIN ? 'Wallet balance' : 'Gift card balance'}). Refunds of those orders come back here.
              </p>
            </div>
            <TextLink href={balanceHref}>{balance ? 'Redeem a gift card or see activity' : 'Redeem a gift card'}</TextLink>
          </Card>
        ) : null}

        {isIN ? (
          <>
            <Section title="Quick actions">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {IN_ACTIONS.map((a) => (<ActionTile key={a.label} label={a.label} href={a.href ? sp(a.href) : startHref} />))}
              </div>
            </Section>

            <Section title="Recharges & bill payments" note="Earn 2% back on your balance on mobile recharges, up to ₹25">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {IN_BILLS.map((a) => (<ActionTile key={a.label} label={a.label} href={a.href ? sp(a.href) : startHref} />))}
              </div>
            </Section>

            <Section title="Financial services">
              <div className={cardGrid}>
                {IN_FINANCE.map((s) => (
                  <InfoCard key={s.title} title={s.title} footer={s.href ? <TextLink href={sp(s.href)}>{user ? 'See Pay Later' : 'Activate Pay Later'}</TextLink> : undefined}>
                    {s.desc}
                  </InfoCard>
                ))}
              </div>
            </Section>
          </>
        ) : (
          <Section title="Why use Store Pay">
            <div className={cardGrid}>
              {US_SERVICES.map((s) => (
                <InfoCard key={s.title} title={s.title} footer={s.href ? <TextLink href={sp(s.href)}>{user ? 'See your balance' : 'Redeem a gift card'}</TextLink> : undefined}>
                  {s.desc}
                </InfoCard>
              ))}
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
              <a href={user ? sp('/prime') : signupHref} className={buttonClasses({ variant: 'dark' })}>
                {user ? 'See Plus benefits' : isIN ? 'Activate Store Pay' : 'Learn about the card'}
              </a>
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

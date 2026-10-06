import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, Card, InfoCard, DemoNote, cardGrid } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { Pill } from '@/components/decision/Pill';
import { buttonClasses } from '@/components/primitives/Button';
import { cn } from '@/components/lib/cn';
import { Alert } from '@/components/primitives/Alert';
import { ClaimDemoButton, RedeemForm } from '@/components/gift-cards/RedeemForm';
import { shortDate } from '@/components/orders/format';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { readUser } from '@/lib/auth';
import { db } from '@/lib/supabase/server';
import { balanceHistory, demoGiftCard, demoGiftCardAmount, storeBalance, type BalanceEntry } from '@/lib/data/balance';

export const metadata: Metadata = { title: 'Gift cards · Store' };

const DENOMS: Record<'US' | 'IN', number[]> = {
  US: [25, 50, 100, 150, 250],
  IN: [100, 250, 500, 1000, 5000],
};

const FORMATS = [
  { title: 'eGift card', desc: 'Delivered by email in minutes — good for last-minute gifting.' },
  { title: 'Print at home', desc: 'Personalise it, print it, and hand it over yourself.' },
  { title: 'Gift box', desc: 'A physical card in a keepsake box, shipped to their door.' },
  { title: 'Corporate gifting', desc: 'Reward employees and clients at scale with bulk cards.' },
];

function entryText(e: BalanceEntry): string {
  switch (e.kind) {
    case 'gift_card': return e.giftCardCode ? `Gift card ${e.giftCardCode}` : 'Gift card';
    case 'order': return e.orderId ? `Order ${e.orderId}` : 'Order';
    default: return e.orderId ? `Refund for order ${e.orderId}` : 'Refund';
  }
}

export default async function GiftCardsPage({ searchParams }: { searchParams: Promise<{ claimed?: string }> }) {
  const [store, user, sp0] = await Promise.all([getMarketplace(), readUser(), searchParams]);
  const client = await db();
  const [balance, history, demo, demoAmount] = user
    ? await Promise.all([storeBalance(client, store.id), balanceHistory(client, store.id), demoGiftCard(client, store.id, user.id), demoGiftCardAmount(client, store.id)])
    : [null, [], null, null];
  const money = (minor: number) => formatMoney(minor, store.currency.code);
  const isIN = store.id === 'IN';
  const sym = store.currency.symbol;
  const sp = (p: string) => storePath(store, p);
  const denoms = DENOMS[isIN ? 'IN' : 'US'];
  const fmt = (n: number) => `${sym}${n.toLocaleString(isIN ? 'en-IN' : 'en-US')}`;
  const occasions = isIN
    ? ['Birthday', 'Diwali', 'Rakhi', 'Wedding', 'Thank you', 'Congrats']
    : ['Birthday', 'Thank you', 'Congratulations', 'Holiday', 'Wedding', 'Just because'];

  return (
    <AppShell>
      <Page>
        <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_340px]">
          <PageHead
            kicker="Gift cards"
            title="Let them choose"
            actions={
              <>
                <a href="#amounts" className={buttonClasses({ variant: 'primary', size: 'lg' })}>Choose an amount</a>
                <a href="#balance" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>Redeem a card</a>
              </>
            }
          >
            When you&apos;re not sure what they need, a gift card lets them pick. No fees, and it never expires.
          </PageHead>
          {/* the card itself: calm ink panel with the store mark */}
          <div aria-hidden className="mx-auto flex aspect-[1.6] w-full max-w-[340px] flex-col justify-between rounded-panel bg-ink p-5 text-on-ink">
            <span className="self-start border-[1.5px] border-dashed border-white px-[9px] py-[6px] font-mono text-[12px] font-semibold leading-none tracking-[0.08em]">[ STORE ]</span>
            <div>
              <Kicker tone="onDark">Gift card</Kicker>
              <p className="m-0 mt-1 text-[30px] font-bold leading-none tabular-nums">{fmt(isIN ? 1000 : 100)}</p>
            </div>
          </div>
        </div>

        <Section id="amounts" title="Choose an amount" note="Delivered by email in minutes">
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
            {denoms.map((d) => (
              <li key={d}>
                <a
                  href={sp('/signin?new=1')}
                  className="flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-card border border-line bg-surface p-3 text-ink no-underline transition-colors hover:border-ink"
                >
                  <span className="text-[22px] font-bold tabular-nums">{fmt(d)}</span>
                  <span className="text-[13px] text-ink-3">Buy</span>
                </a>
              </li>
            ))}
            <li>
              <a
                href={sp('/signin?new=1')}
                className="flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-3 bg-surface p-3 text-ink no-underline transition-colors hover:border-ink"
              >
                <span className="text-[16px] font-semibold">Custom</span>
                <span className="text-[13px] text-ink-3">Any amount</span>
              </a>
            </li>
          </ul>
        </Section>

        <Section title="Pick how you send it">
          <div className={cardGrid}>
            {FORMATS.map((f, i) => (<InfoCard key={f.title} index={String(i + 1).padStart(2, '0')} title={f.title}>{f.desc}</InfoCard>))}
          </div>
        </Section>

        <Section title="Shop by occasion">
          <div className="flex flex-wrap gap-2">
            {occasions.map((o) => (<Pill key={o} href={sp('/signin?new=1')}>{o}</Pill>))}
          </div>
        </Section>

        <Section id="balance" title="Your gift card balance" note={user ? undefined : 'Redeem codes into your balance, then pay with it at checkout'}>
          {sp0.claimed && demo && !demo.redeemed ? (
            <Alert tone="success">Your demo gift card is ready: <b className="font-mono">{demo.code}</b>. Redeem it below, or give the code to someone.</Alert>
          ) : null}
          {user && balance !== null ? (
            <div className="grid gap-3.5 md:grid-cols-2">
              <Card className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <Kicker>Available balance</Kicker>
                  <p className="m-0 text-[32px] font-bold leading-none tracking-[-0.01em] tabular-nums">{money(balance)}</p>
                </div>
                <p className="m-0 text-[14px] text-ink-2">
                  Pay with it at checkout ({isIN ? 'Wallet balance' : 'Gift card balance'}). Refunds of those orders come back here.
                </p>
                <h3 className="m-0 mt-1 text-[17px] font-semibold text-ink">Redeem a gift card</h3>
                <RedeemForm code={demo && !demo.redeemed ? demo.code : ''} />
              </Card>
              <Card className="flex flex-col gap-3">
                {demoAmount !== null && !demo ? (
                  <div className="flex flex-col gap-2 border-b border-line-2 pb-3">
                    <h3 className="m-0 text-[17px] font-semibold text-ink">Try it with a demo gift card</h3>
                    <p className="m-0 text-[14px] text-ink-2">Get a {money(demoAmount)} gift card code for this store, free — one per account.</p>
                    <ClaimDemoButton label={`Get a ${money(demoAmount)} demo gift card`} />
                  </div>
                ) : demo ? (
                  <p className="m-0 border-b border-line-2 pb-3 text-[14px] text-ink-2">
                    Your demo gift card <b className="font-mono text-ink">{demo.code}</b> ({money(demo.amountMinor)}) {demo.redeemed ? 'has been redeemed.' : 'is waiting to be redeemed.'}
                  </p>
                ) : null}
                <h3 className="m-0 text-[17px] font-semibold text-ink">Activity</h3>
                {history.length ? (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {history.map((e) => (
                      <li key={e.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{entryText(e)}</span>
                          <span className="text-[13px] text-ink-3">{shortDate(new Date(e.at), store)}</span>
                        </span>
                        <span className={cn('flex-none font-semibold tabular-nums', e.amountMinor > 0 ? 'text-good' : 'text-ink')}>
                          {e.amountMinor > 0 ? '+' : '−'}{money(Math.abs(e.amountMinor))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-[14px] text-ink-2">Nothing yet. Redeemed cards, orders and refunds show up here.</p>
                )}
              </Card>
            </div>
          ) : user ? (
            <Card>
              <p className="m-0 text-[14px] text-ink-2">Your balance can’t be shown right now. Try again in a moment.</p>
            </Card>
          ) : (
            <Card className="flex flex-col items-start gap-3">
              <p className="m-0 text-[14px] text-ink-2">Sign in to redeem a gift card, see your balance and get a demo gift card to try it.</p>
              <a href={sp(`/signin?next=/gift-cards`)} className={buttonClasses({ variant: 'dark' })}>Sign in to redeem</a>
            </Card>
          )}
        </Section>

        <DemoNote>Demo store — buying gift cards isn’t available and no payment is processed. Demo gift card codes are real here: redeeming one adds to your balance in this store, and paying with the balance takes the order total from it.</DemoNote>
      </Page>
    </AppShell>
  );
}

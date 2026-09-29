import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Page, PageHead, Section, Card, InfoCard, TextLink, DemoNote, cardGrid } from '@/components/brand/Page';
import { Kicker } from '@/components/decision/Badges';
import { Pill } from '@/components/decision/Pill';
import { buttonClasses } from '@/components/primitives/Button';
import { fieldClass } from '@/components/lib/controls';
import { cn } from '@/components/lib/cn';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';

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

export default async function GiftCardsPage() {
  const store = await getMarketplace();
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
                <a href="#redeem" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>Redeem a card</a>
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

        <Section id="redeem" title="Redeem or reload">
          <div className="grid gap-3.5 md:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <h3 className="m-0 text-[17px] font-semibold text-ink">Redeem a gift card</h3>
              <p className="m-0 text-[14px] text-ink-2">Enter the claim code to add the amount to your balance.</p>
              <form action={sp('/signin')} className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="claim" className="sr-only">Gift card claim code</label>
                {/* no name: the demo only routes to sign-in, the code never leaves the page */}
                <input id="claim" autoComplete="off" placeholder="XXXX-XXXXXX-XXXX" className={cn(fieldClass, 'flex-1 font-mono')} />
                <button type="submit" className={buttonClasses({ variant: 'dark' })}>Apply</button>
              </form>
            </Card>
            <InfoCard title="Reload your balance" footer={<TextLink href={sp('/amazon-pay')}>Reload now</TextLink>}>
              Top up your store balance and check out without re-entering card details.
            </InfoCard>
          </div>
        </Section>

        <DemoNote>Demo store — gift cards are illustrative, codes are not checked, and no payment is processed.</DemoNote>
      </Page>
    </AppShell>
  );
}

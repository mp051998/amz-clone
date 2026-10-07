import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { DemoNote } from '@/components/brand/Page';
import { EmptyState } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { Button } from '@/components/primitives/Button';
import { addCardAction, removeCardAction } from '@/app/actions/wallet';
import { readUser } from '@/lib/auth';
import { storeBalance } from '@/lib/data/balance';
import { DataError, messageFor } from '@/lib/data/errors';
import { addedCard, cardLabel, listSavedCards, type SavedCard } from '@/lib/data/wallet';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { formatMoney } from '@/lib/marketplaces';
import { stripeConfigured } from '@/lib/stripe';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your Payments · Store' };

const textBtn = 'min-h-11 px-1 text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink';
const mmyy = (c: SavedCard) => `${String(c.expMonth).padStart(2, '0')}/${c.expYear}`;

function CardRow({ c }: { c: SavedCard }) {
  const label = cardLabel(c);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-[18px]">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="flex h-9 w-14 flex-none items-center justify-center rounded-input border border-line bg-surface-2 text-[12px] font-semibold text-ink">
          {c.brand}
        </span>
        <div className="flex min-w-0 flex-col">
          <strong className="text-[15px] font-semibold text-ink">{label}</strong>
          <span className="text-[13px] text-ink-2">
            {c.expired ? <b className="font-semibold text-bad">Expired {mmyy(c)}</b> : `Expires ${mmyy(c)}`}
          </span>
        </div>
      </div>
      <form action={removeCardAction}>
        <input type="hidden" name="id" value={c.id} />
        <button type="submit" className={textBtn} aria-label={`Remove ${label}`}>Remove</button>
      </form>
    </li>
  );
}

/**
 * Your Payments (Amazon's wallet): the cards saved on Stripe, to remove or add to, and the store
 * balance. Cards are saved when paying by card (Stripe's page offers it) or added here.
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ added?: string; removed?: string; canceled?: string; error?: string }> }) {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/account/payments'));
  const q = await searchParams;

  let cards: SavedCard[] | null = [];
  try {
    cards = await listSavedCards(user.id);
  } catch (err) {
    if (!(err instanceof DataError)) throw err;
    cards = null;
  }
  const [added, balance] = await Promise.all([q.added ? addedCard(user.id, q.added) : null, storeBalance(await db(), store.id)]);
  const problem = q.error ? (messageFor(q.error) ?? 'Something went wrong. Please try again.') : null;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <a href={sp('/account')} className="self-start text-[14px] text-ink underline underline-offset-2">← Account</a>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Your Payments</h1>
          <span className="text-[15px] text-ink-2">Your saved cards, and your gift card balance in this store.</span>
        </div>

        {added ? <Alert tone="success">{cardLabel(added)} is saved. Pick it on Stripe’s page next time you pay by card.</Alert> : null}
        {q.removed ? <Alert tone="success">Card removed.</Alert> : null}
        {q.canceled ? <Alert tone="info">No card was added.</Alert> : null}
        {problem ? <Alert tone="error">{problem}</Alert> : null}

        <section className="flex flex-col gap-3.5" aria-labelledby="cards-h">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="cards-h" className="m-0 text-[22px] font-semibold leading-tight">Cards</h2>
            <span className="text-[14px] text-ink-3">Kept by Stripe; we never see the number</span>
          </div>
          {!stripeConfigured ? (
            <EmptyState title="Card payments aren’t set up here">There are no cards to save in this store.</EmptyState>
          ) : cards === null ? (
            <Alert tone="error">Your saved cards can’t be shown right now. Try again in a moment.</Alert>
          ) : cards.length ? (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {cards.map((c) => <CardRow key={c.id} c={c} />)}
            </ul>
          ) : (
            <EmptyState title="No saved cards">Save a card on Stripe’s page when you pay by card, or add one here.</EmptyState>
          )}
          {stripeConfigured ? (
            <form action={addCardAction}>
              <Button type="submit" variant="secondary">Add a card</Button>
            </form>
          ) : null}
        </section>

        <section className="flex flex-col gap-3.5" aria-labelledby="balance-h">
          <h2 id="balance-h" className="m-0 text-[22px] font-semibold leading-tight">Gift card balance</h2>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-[18px]">
            <div className="flex flex-col">
              <strong className="text-[22px] font-semibold tabular-nums">{formatMoney(balance ?? 0, store.currency.code)}</strong>
              <span className="text-[13px] text-ink-2">Pay with it at checkout.</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a href={sp('/gift-cards#balance')} className={textBtn}>Redeem a gift card</a>
              {stripeConfigured ? <a href={sp('/gift-cards#reload')} className={textBtn}>{store.id === 'IN' ? 'Add money' : 'Reload your balance'}</a> : null}
            </div>
          </div>
        </section>

        <DemoNote>Demo store — cards are saved on Stripe in test mode. Add one with test card 4242 4242 4242 4242, any future expiry and any CVC; no real card is ever stored.</DemoNote>
      </div>
    </AppShell>
  );
}

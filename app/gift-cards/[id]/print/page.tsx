import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Wordmark } from '@/components/chrome/Wordmark';
import { PrintButton } from '@/components/orders/PrintButton';
import { firstName, readUser } from '@/lib/auth';
import { listGiftCardPurchases, wholeMoney } from '@/lib/data/gift-card-purchases';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { siteOrigin } from '@/lib/origin';
import { db } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Print gift card · Store' };

/**
 * Print at home, as Amazon's printable gift cards: one of the shopper's paid gift card purchases as
 * cards to print and hand over, each with its amount, who it's for and from, the message and its
 * code, and where to redeem it. A purchase of several cards prints one per code; `?code=` narrows it
 * to one of them. Balance reloads have no code, so nothing to print.
 */
export default async function PrintGiftCardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ code?: string }> }) {
  const [{ id }, { code }] = await Promise.all([params, searchParams]);
  const store = await getMarketplace();
  const self = `/gift-cards/${encodeURIComponent(id)}/print${code ? `?code=${encodeURIComponent(code)}` : ''}`;
  const user = await readUser();
  if (!user) redirect(storePath(store, `/signin?next=${encodeURIComponent(self)}`));
  // the purchases the gift cards page lists (and a few more), paid and with their codes
  const purchase = (await listGiftCardPurchases(await db(), store.id, 50)).find((p) => p.id === id && !p.reload && p.status === 'paid');
  if (!purchase || !purchase.codes.length) notFound();
  const one = code ? purchase.codes.filter((c) => c.code === code) : [];
  const cards = one.length ? one : purchase.codes;
  const amount = wholeMoney(purchase.amountMinor, store.currency.code);
  const redeemAt = `${await siteOrigin()}${storePath(store, '/gift-cards')}`;
  const back = storePath(store, '/gift-cards#purchases');

  return (
    <div className="min-h-screen bg-bg px-[clamp(12px,3vw,24px)] pb-16 pt-6 text-ink print:bg-white print:p-0">
      <nav className="mx-auto mb-4 flex max-w-[720px] flex-wrap items-center justify-between gap-3 print:hidden" aria-label="Print gift card">
        <a href={back} className="text-[14px] text-ink underline underline-offset-2">← Back to gift cards</a>
        <PrintButton label={cards.length > 1 ? `Print ${cards.length} gift cards` : 'Print gift card'} />
      </nav>

      <div className="mx-auto flex max-w-[720px] flex-col gap-6 print:max-w-none print:gap-10">
        {cards.map((c, i) => (
          <article
            key={c.code}
            aria-label={cards.length > 1 ? `Gift card ${i + 1} of ${cards.length}` : 'Gift card'}
            className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-[clamp(18px,4vw,40px)] [break-inside:avoid] print:rounded-card print:border-ink"
          >
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <Wordmark />
                <p className="m-0 text-[13px] text-ink-3">Demo store · no real money</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <h1 className="m-0 text-[15px] font-semibold uppercase tracking-[0.06em] text-ink-2">Gift card</h1>
                <p className="m-0 text-[36px] font-bold leading-none tabular-nums">{amount}</p>
              </div>
            </header>

            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-6 gap-y-3 text-[15px]">
              {purchase.recipientName ? (
                <div>
                  <dt className="text-[13px] text-ink-3">To</dt>
                  <dd className="m-0 font-medium">{purchase.recipientName}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[13px] text-ink-3">From</dt>
                <dd className="m-0 font-medium">{firstName(user)}</dd>
              </div>
            </dl>
            {purchase.message ? <p className="m-0 whitespace-pre-line text-[17px] italic leading-[1.5] text-ink-2">“{purchase.message}”</p> : null}

            <section aria-label="Gift card code" className="flex flex-col gap-1 rounded-card bg-surface-2 p-4 print:border print:border-line">
              <span className="text-[13px] text-ink-3">Gift card code</span>
              <span className="font-mono text-[24px] font-semibold tracking-[0.04em]">{c.code}</span>
              {c.redeemed ? <span className="text-[13px] font-semibold text-bad">This code has already been redeemed.</span> : null}
            </section>

            <footer className="border-t border-line-2 pt-4 text-[13px] leading-relaxed text-ink-3">
              To use it, sign in at <span className="font-mono text-ink-2">{redeemAt}</span>, enter the code under “Your gift card balance” and choose Redeem.
              It’s added to the balance and used at checkout. Anyone with the code can redeem it once, so keep it safe.
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}

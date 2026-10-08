import { bankOfferMethodsText, bankOfferText, type BankOffer } from '@/lib/bank-offers';
import { formatMoney } from '@/lib/marketplaces';
import type { CurrencyCode } from '@/lib/contracts';

/**
 * amazon.in's Bank Offer under the price: the biggest one in a line ("Up to ₹1,500.00 off with
 * HDFC Bank EMI") and every offer's terms a tap away. It comes off at checkout when paying through
 * that bank by net banking or EMI. Nothing without offers.
 */
export function BankOffers({ offers, currency }: { offers: readonly BankOffer[]; currency: CurrencyCode }) {
  // highest cap first
  const top = offers[0];
  if (!top) return null;
  const money = (minor: number) => formatMoney(minor, currency);
  return (
    <div className="text-[14px] text-ink-2">
      <span className="mr-1.5 rounded-tag bg-good-bg px-1.5 py-px text-[12px] font-bold text-good-strong">Bank Offer</span>
      Up to <strong className="font-semibold text-ink tabular-nums">{money(top.maxOffMinor)}</strong> off with {top.bank} {bankOfferMethodsText(top.methods)}.{' '}
      <details className="group inline">
        <summary className="inline cursor-pointer list-none text-ink underline underline-offset-2 hover:text-accent-ink [&::-webkit-details-marker]:hidden">
          {offers.length === 1 ? 'Terms' : `See all ${offers.length} offers`}
        </summary>
        <ul className="m-0 mt-2 flex max-w-[460px] list-none flex-col gap-1.5 p-0 text-[13px]">
          {offers.map((o) => (
            <li key={o.id} className="border-t border-line-2 pt-1.5 text-ink">{bankOfferText(o, money)}.</li>
          ))}
        </ul>
        <p className="m-0 mt-1 text-[12px] text-ink-3">Choose the bank under net banking or EMI at checkout, and its best offer comes off the items.</p>
      </details>
    </div>
  );
}

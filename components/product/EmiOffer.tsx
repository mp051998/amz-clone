import { emiFrom, type EmiPlan } from '@/lib/emi';
import { formatMoney } from '@/lib/marketplaces';
import type { CurrencyCode } from '@/lib/contracts';

/**
 * amazon.in's line under the price: "EMI starts at ₹1,361. No Cost EMI available." with the plans
 * a tap away (months, monthly payment, interest). Nothing without EMI.
 */
export function EmiOffer({ plans, currency }: { plans: readonly EmiPlan[]; currency: CurrencyCode }) {
  const from = emiFrom(plans);
  if (from === null) return null;
  const money = (minor: number) => formatMoney(minor, currency);
  return (
    <div className="text-[14px] text-ink-2">
      EMI starts at <strong className="font-semibold text-ink tabular-nums">{money(from)}</strong>.
      {plans.some((p) => p.noCost) ? ' No Cost EMI available.' : null}{' '}
      <details className="group inline">
        <summary className="inline cursor-pointer list-none text-ink underline underline-offset-2 hover:text-accent-ink [&::-webkit-details-marker]:hidden">EMI options</summary>
        <table className="mt-2 w-full max-w-[420px] border-collapse text-[13px]">
          <caption className="sr-only">EMI plans with credit cards</caption>
          <thead>
            <tr className="text-left text-ink-3">
              <th scope="col" className="py-1 pr-3 font-medium">Plan</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Monthly</th>
              <th scope="col" className="py-1 text-right font-medium">Interest</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.months} className="border-t border-line-2">
                <th scope="row" className="py-1 pr-3 text-left font-normal text-ink">
                  {p.months} months{p.noCost ? <span className="ml-1.5 rounded-tag bg-good-bg px-1 py-px text-[11px] font-bold text-good-strong">No Cost</span> : null}
                </th>
                <td className="py-1 pr-3 text-right tabular-nums text-ink">{money(p.monthlyMinor)}</td>
                <td className="py-1 text-right tabular-nums">{money(p.interestMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 mt-1 text-[12px] text-ink-3">With a credit card, chosen at checkout. No Cost EMI takes the bank’s interest off as a discount.</p>
      </details>
    </div>
  );
}

import { selectClass } from '@/components/lib/controls';
import { CHECKOUT_BANKS } from '@/lib/bank-offers';

export const payRadio = 'mt-0.5 size-4 flex-none accent-ink';
export const payChoice = 'flex cursor-pointer items-start gap-2.5 rounded-input border border-line bg-surface p-3 text-[14px] has-[:checked]:border-ink';

/**
 * "Pay with" for Store Pay's recharges and bills: the store balance ("Wallet balance", chosen
 * when there's some), UPI, or net banking with a bank. Posts `method` (amazonpay | upi |
 * netbanking) and `bank`.
 */
export function PayMethods({ balance, money }: { balance: number | null; money: (minor: number) => string }) {
  const hasBalance = (balance ?? 0) > 0;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-[15px] font-semibold">Pay with</legend>
      <label className={payChoice}>
        <input type="radio" name="method" value="amazonpay" defaultChecked={hasBalance} className={payRadio} />
        <span>
          <span className="font-semibold">Wallet balance</span>
          {balance != null ? <span className="text-ink-2"> · {money(balance)} available</span> : null}
        </span>
      </label>
      <label className={payChoice}>
        <input type="radio" name="method" value="upi" defaultChecked={!hasBalance} className={payRadio} />
        <span className="font-semibold">UPI</span>
      </label>
      <label className={payChoice}>
        <input type="radio" name="method" value="netbanking" className={payRadio} />
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Net banking</span>
          <select name="bank" aria-label="Bank" defaultValue={CHECKOUT_BANKS[0]} className={selectClass}>
            {CHECKOUT_BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
          </select>
        </span>
      </label>
    </fieldset>
  );
}

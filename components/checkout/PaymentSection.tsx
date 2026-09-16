'use client';
import { useState } from 'react';
import { Input } from '../primitives/Input';
import { selectClass } from '../lib/controls';

export interface PaymentSectionProps {
  /** ordered payment method keys from the store config (card, upi, cod, …). */
  methods: string[];
  /** store currency symbol, for dummy balances. */
  curSymbol: string;
  /** default name to prefill card/gift-card holder fields. */
  defaultName: string;
}

const LABEL: Record<string, string> = {
  card: 'Credit or debit card',
  giftcard: 'Amazon gift card balance',
  upi: 'UPI',
  netbanking: 'Net banking',
  cod: 'Cash on Delivery / Pay on Delivery',
  emi: 'EMI',
  amazonpay: 'Amazon Pay balance',
};

const BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Yes Bank'];

/** Interactive (demo) payment picker: choosing a method reveals that method's dummy fields. */
export function PaymentSection({ methods, curSymbol, defaultName }: PaymentSectionProps) {
  const [selected, setSelected] = useState(methods[0] ?? 'card');

  return (
    <section className="rounded-[8px] border border-line bg-white p-5">
      <h2 className="mb-1 text-[18px] font-bold text-ink">2. Payment method</h2>
      <p className="mb-3 text-[12px] text-ink-2">Demo only — no real payment is processed. Any values work.</p>

      <div className="max-w-[560px] divide-y divide-line-3 rounded-[6px] border border-line-3">
        {methods.map((m) => {
          const active = selected === m;
          return (
            <div key={m}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[14px] text-ink">
                <input type="radio" name="payMethod" value={m} checked={active} onChange={() => setSelected(m)} />
                <span className="font-medium">{LABEL[m] ?? m}</span>
                {m === 'cod' ? <span className="rounded-[3px] bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">No card needed</span> : null}
                {m === 'upi' ? <span className="rounded-[3px] bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">Instant</span> : null}
              </label>
              {active ? <div className="px-3 pb-4 pt-1">{fields(m, curSymbol, defaultName)}</div> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function fields(method: string, curSymbol: string, defaultName: string) {
  switch (method) {
    case 'card':
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input name="cardName" label="Name on card" defaultValue={defaultName} /></div>
          <div className="sm:col-span-2"><Input name="card" label="Card number" inputMode="numeric" placeholder="4242 4242 4242 4242" defaultValue="4242 4242 4242 4242" /></div>
          <Input name="exp" label="Expiration (MM/YY)" placeholder="12/29" defaultValue="12/29" />
          <Input name="cvc" label="CVV" inputMode="numeric" placeholder="123" defaultValue="123" />
        </div>
      );
    case 'giftcard':
      return (
        <div className="grid max-w-[420px] grid-cols-1 gap-3">
          <Input name="giftCard" label="Gift card / claim code" placeholder="XXXX-XXXXXX-XXXX" defaultValue="AMZN-DEMO12-CARD" />
          <p className="text-[12px] text-ink-2">Available balance: <b className="text-ink">{curSymbol}0.00</b> — the order total will be charged to your default method for this demo.</p>
        </div>
      );
    case 'upi':
      return (
        <div className="grid max-w-[420px] grid-cols-1 gap-2">
          <div className="flex items-end gap-2">
            <div className="flex-1"><Input name="upiId" label="Enter UPI ID" placeholder="name@okhdfcbank" defaultValue="aarav@okhdfcbank" /></div>
            <button type="button" className="h-[31px] shrink-0 rounded-[3px] border border-line bg-surface-2 px-3 text-[13px] text-ink hover:bg-surface-3">Verify</button>
          </div>
          <p className="text-[12px] text-ink-2">A collect request will be sent to your UPI app. (Demo — nothing is sent.)</p>
        </div>
      );
    case 'netbanking':
      return (
        <label className="block max-w-[420px] text-[13px] font-bold text-ink">
          Choose your bank
          <select name="bank" defaultValue={BANKS[0]} className={`mt-1 w-full ${selectClass}`}>
            {BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
          </select>
        </label>
      );
    case 'cod':
      return (
        <div className="max-w-[420px] rounded-[6px] bg-surface-2 p-3 text-[13px] text-ink-2">
          Pay by cash, UPI or card to the delivery agent when your order arrives. <b className="text-ink">{curSymbol}0.00</b> is charged now.
        </div>
      );
    case 'emi':
      return (
        <div className="grid max-w-[520px] grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-[13px] font-bold text-ink">
            Bank
            <select name="emiBank" defaultValue={BANKS[0]} className={`mt-1 w-full ${selectClass}`}>
              {BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
          </label>
          <label className="block text-[13px] font-bold text-ink">
            Tenure
            <select name="emiTenure" defaultValue="3" className={`mt-1 w-full ${selectClass}`}>
              {['3', '6', '9', '12'].map((t) => (<option key={t} value={t}>{t} months</option>))}
            </select>
          </label>
          <p className="text-[12px] text-ink-2 sm:col-span-2">Interest and processing fees apply as per your bank. (Demo — no EMI is created.)</p>
        </div>
      );
    case 'amazonpay':
      return (
        <div className="flex max-w-[420px] items-center justify-between rounded-[6px] bg-surface-2 p-3 text-[13px]">
          <span className="text-ink-2">Amazon Pay balance: <b className="text-ink">{curSymbol}0.00</b></span>
          <button type="button" className="h-[28px] rounded-pill border border-line bg-white px-3 text-[12px] text-ink hover:bg-surface-3">Add money</button>
        </div>
      );
    default:
      return null;
  }
}

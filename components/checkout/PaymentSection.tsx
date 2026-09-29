'use client';
import { useState } from 'react';
import { Input } from '../primitives/Input';
import { selectClass } from '../lib/controls';
import { OptionCard, StepCard } from './StepCard';

export interface PaymentSectionProps {
  /** ordered payment method keys from the store config (card, upi, cod, …). */
  methods: string[];
  /** store currency symbol, for dummy balances. */
  curSymbol: string;
  /** default name to prefill card/gift-card holder fields. */
  defaultName: string;
  /** when true, card payments redirect to Stripe Checkout — hide the demo card fields. */
  stripeCard?: boolean;
  /** step number (default 2). */
  n?: number;
}

const LABEL: Record<string, string> = {
  card: 'Credit or debit card',
  giftcard: 'Gift card balance',
  upi: 'UPI',
  netbanking: 'Net banking',
  cod: 'Pay on delivery',
  emi: 'EMI',
  amazonpay: 'Wallet balance',
};

function subFor(m: string, stripeCard: boolean): string {
  switch (m) {
    case 'card': return stripeCard ? "You'll pay on Stripe's secure page next" : 'Demo card — nothing is charged';
    case 'giftcard': return 'Use a gift card or claim code';
    case 'upi': return 'Instant — approve in your UPI app';
    case 'netbanking': return 'Pay from your bank account';
    case 'cod': return 'Cash, UPI or card when it arrives';
    case 'emi': return 'Split the total into monthly payments';
    case 'amazonpay': return 'Pay from your store wallet';
    default: return '';
  }
}

const BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Yes Bank'];

/**
 * Step 2 — Payment method. The chosen method is always posted as `payMethod` (radio inputs stay in the
 * form while the list is collapsed); the selected method's demo fields show under the list.
 */
export function PaymentSection({ methods, curSymbol, defaultName, stripeCard = false, n = 2 }: PaymentSectionProps) {
  const [selected, setSelected] = useState(methods[0] ?? 'card');
  const [open, setOpen] = useState(false);
  const listId = 'checkout-payment-options';

  return (
    <StepCard
      n={n}
      title="Payment method"
      value={LABEL[selected] ?? selected}
      sub={subFor(selected, stripeCard)}
      toggle={methods.length > 1 ? { open, onToggle: () => setOpen((o) => !o), controls: listId, label: 'payment method' } : undefined}
    >
      <div id={listId} role="radiogroup" aria-label="Payment method" className={open ? 'flex flex-col gap-2 sm:pl-[42px]' : 'hidden'}>
        {methods.map((m) => (
          <OptionCard
            key={m}
            name="payMethod"
            value={m}
            checked={selected === m}
            onChange={() => setSelected(m)}
            label={LABEL[m] ?? m}
            sub={subFor(m, stripeCard)}
            badge={m === 'cod' ? 'No card needed' : m === 'upi' ? 'Instant' : undefined}
          />
        ))}
        <p className="m-0 text-[13px] text-ink-3">
          {stripeCard
            ? 'Card payments are handled on Stripe’s secure checkout page — no card details are entered here. Other methods are demo only.'
            : 'Demo only — no real payment is processed. Any values work.'}
        </p>
      </div>
      <div className="sm:pl-[42px]">{selected === 'card' && stripeCard ? stripeCardNotice() : fields(selected, curSymbol, defaultName)}</div>
    </StepCard>
  );
}

/** shown for the card method when Stripe is live: card entry happens on Stripe, not here. */
function stripeCardNotice() {
  return (
    <div className="max-w-[480px] rounded-input bg-surface-2 p-3 text-[13px] text-ink-2">
      <p className="m-0 flex items-center gap-1.5 font-semibold text-ink">
        <span aria-hidden>🔒</span> You&apos;ll enter your card on Stripe&apos;s secure page.
      </p>
      <p className="m-0 mt-1">After you place the order, we redirect you to Stripe Checkout to pay. Use test card <b className="font-mono text-ink">4242 4242 4242 4242</b>, any future expiry and any CVC.</p>
    </div>
  );
}

const note = 'm-0 text-[13px] text-ink-2';

function fields(method: string, curSymbol: string, defaultName: string) {
  switch (method) {
    case 'card':
      return (
        <div className="grid max-w-[480px] grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input name="cardName" label="Name on card" defaultValue={defaultName} /></div>
          <div className="sm:col-span-2"><Input name="card" label="Card number" inputMode="numeric" placeholder="4242 4242 4242 4242" defaultValue="4242 4242 4242 4242" /></div>
          <Input name="exp" label="Expiration (MM/YY)" placeholder="12/29" defaultValue="12/29" />
          <Input name="cvc" label="CVV" inputMode="numeric" placeholder="123" defaultValue="123" />
        </div>
      );
    case 'giftcard':
      return (
        <div className="grid max-w-[420px] grid-cols-1 gap-2">
          <Input name="giftCard" label="Gift card / claim code" placeholder="XXXX-XXXXXX-XXXX" defaultValue="DEMO-GIFT12-CARD" />
          <p className={note}>Available balance: <b className="text-ink">{curSymbol}0.00</b> — for this demo the order is placed without a charge.</p>
        </div>
      );
    case 'upi':
      return (
        <div className="grid max-w-[420px] grid-cols-1 gap-2">
          <Input name="upiId" label="UPI ID" placeholder="name@okhdfcbank" defaultValue="aarav@okhdfcbank" />
          <p className={note}>A collect request would be sent to your UPI app. (Demo — nothing is sent.)</p>
        </div>
      );
    case 'netbanking':
      return (
        <label className="flex max-w-[420px] flex-col gap-1.5 text-[14px] font-semibold text-ink">
          Choose your bank
          <select name="bank" defaultValue={BANKS[0]} className={`w-full font-normal ${selectClass}`}>
            {BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
          </select>
        </label>
      );
    case 'cod':
      return (
        <p className={`max-w-[480px] rounded-input bg-surface-2 p-3 ${note}`}>
          Pay by cash, UPI or card to the delivery agent when your order arrives. <b className="text-ink">{curSymbol}0.00</b> is charged now.
        </p>
      );
    case 'emi':
      return (
        <div className="grid max-w-[520px] grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-ink">
            Bank
            <select name="emiBank" defaultValue={BANKS[0]} className={`w-full font-normal ${selectClass}`}>
              {BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-ink">
            Tenure
            <select name="emiTenure" defaultValue="3" className={`w-full font-normal ${selectClass}`}>
              {['3', '6', '9', '12'].map((t) => (<option key={t} value={t}>{t} months</option>))}
            </select>
          </label>
          <p className={`sm:col-span-2 ${note}`}>Interest and processing fees apply as per your bank. (Demo — no EMI is created.)</p>
        </div>
      );
    case 'amazonpay':
      return (
        <p className={`max-w-[420px] rounded-input bg-surface-2 p-3 ${note}`}>
          Wallet balance: <b className="text-ink">{curSymbol}0.00</b> — for this demo the order is placed without a charge.
        </p>
      );
    default:
      return null;
  }
}

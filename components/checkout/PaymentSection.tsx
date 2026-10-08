'use client';
import { useState } from 'react';
import { Input } from '../primitives/Input';
import { selectClass } from '../lib/controls';
import { OptionCard, StepCard } from './StepCard';
import { CHECKOUT_BANKS } from '@/lib/bank-offers';

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
  /** the shopper's gift card balance in this store, for the balance methods (giftcard, amazonpay). */
  balance?: BalanceInfo;
  /** EMI plans for the order total, each tenure with its monthly payment ("₹5,000 a month · No Cost EMI") */
  emi?: { months: number; text: string }[];
  /** the method to start on (else the first) */
  initial?: string;
  /** how the shopper paid last time in this store, marked "Last used" */
  lastUsed?: string;
  /** net banking and EMI: each bank's Bank Offer for this order, shown when that bank is chosen */
  bankOffers?: Partial<Record<'netbanking' | 'emi', Record<string, BankOfferNote>>>;
  /** methods listed but greyed out for this order, each with why ("Not available on orders over ₹50,000") */
  unavailable?: Partial<Record<string, string>>;
}

/** A bank's offer for this order: its terms, and what it takes off (absent when the items don't reach its minimum). */
export interface BankOfferNote {
  /** "10% Instant Discount up to ₹1,500 on HDFC Bank EMI, on orders of ₹5,000 and above" */
  text: string;
  /** "₹1,500.00" */
  savings?: string;
}

export interface BalanceInfo {
  /** formatted balance, e.g. "$100.00" */
  text: string;
  /** the balance doesn't cover the order total */
  short: boolean;
  /** where to redeem a gift card */
  redeemHref: string;
  /** where to reload the balance by card (absent: card payments aren't set up) */
  reloadHref?: string;
  /** there's some balance but not enough for the order: offer it alongside card, UPI or net banking */
  partial?: boolean;
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
    case 'giftcard': return 'Pay from your gift card balance';
    case 'upi': return 'Instant — approve in your UPI app';
    case 'netbanking': return 'Pay from your bank account';
    case 'cod': return 'Cash, UPI or card when it arrives';
    case 'emi': return 'Split the total into monthly payments';
    case 'amazonpay': return 'Pay from your store wallet';
    default: return '';
  }
}

const BANKS: readonly string[] = CHECKOUT_BANKS;

/** the methods the balance can pay part of an order alongside (lib/data/balance SPLIT_METHODS) */
const SPLIT: readonly string[] = ['card', 'upi', 'netbanking'];

/**
 * "Use your balance": ticked, the balance pays what it covers and the chosen method the rest
 * (posted as `useBalance`). Ticked to start with, as on Amazon.
 */
function UseBalance({ balance, method }: { balance: BalanceInfo; method: string }) {
  return (
    <label className="mt-3 flex max-w-[480px] cursor-pointer items-start gap-2.5 rounded-input border border-line bg-surface p-3 text-[14px]">
      <input type="checkbox" name="useBalance" defaultChecked className="mt-[3px] h-4 w-4 shrink-0 accent-ink" />
      <span>
        Use your <b className="tabular-nums">{balance.text}</b> balance
        <span className="block text-[13px] text-ink-3">{LABEL[method] ?? method} pays the rest of the order total.</span>
      </span>
    </label>
  );
}

/**
 * Step 2 — Payment method. The chosen method is always posted as `payMethod` (radio inputs stay in the
 * form while the list is collapsed); the selected method's demo fields show under the list.
 */
export function PaymentSection({ methods, curSymbol, defaultName, stripeCard = false, n = 2, balance, emi, initial, lastUsed, bankOffers, unavailable = {} }: PaymentSectionProps) {
  const open_ = methods.filter((m) => !unavailable[m]);
  const [selected, setSelected] = useState(initial && open_.includes(initial) ? initial : open_[0] ?? 'card');
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
            sub={unavailable[m] ?? subFor(m, stripeCard)}
            badge={unavailable[m] ? undefined : m === lastUsed ? 'Last used' : m === 'cod' ? 'No card needed' : m === 'upi' ? 'Instant' : hasOffers(bankOffers, m) ? 'Bank offers' : undefined}
            disabled={!!unavailable[m]}
          />
        ))}
        <p className="m-0 text-[13px] text-ink-3">
          {stripeCard
            ? 'Card payments are handled on Stripe’s secure checkout page — no card details are entered here. Other methods are demo only.'
            : 'Demo only — no real payment is processed. Any values work.'}
        </p>
      </div>
      <div className="sm:pl-[42px]">
        {selected === 'card' && stripeCard ? stripeCardNotice()
          : selected === 'netbanking' ? <NetBankingFields offers={bankOffers?.netbanking} />
          : selected === 'emi' ? <EmiFields emi={emi} offers={bankOffers?.emi} />
          : fields(selected, curSymbol, defaultName, balance)}
        {balance?.partial && SPLIT.includes(selected) ? <UseBalance balance={balance} method={selected} /> : null}
      </div>
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
      <p className="m-0 mt-1">Your saved cards show there, and you can save this one for next time.</p>
    </div>
  );
}

const note = 'm-0 text-[13px] text-ink-2';

function hasOffers(offers: PaymentSectionProps['bankOffers'], method: string): boolean {
  return (method === 'netbanking' || method === 'emi') && Object.keys(offers?.[method] ?? {}).length > 0;
}

/** The chosen bank's offer: what it takes off this order, or what it needs. */
function BankOfferLine({ offer }: { offer: BankOfferNote }) {
  return offer.savings ? (
    <p className="m-0 rounded-input bg-good-bg p-2.5 text-[13px] text-ink-2" role="status">
      <b className="font-semibold text-good-strong">Bank Offer: −{offer.savings} on this order.</b> {offer.text}.
    </p>
  ) : (
    <p className={`rounded-input bg-surface-2 p-2.5 ${note}`} role="status">
      <b className="font-semibold text-ink">Bank Offer:</b> {offer.text}.
    </p>
  );
}

function BankSelect({ name, label, bank, onChange }: { name: string; label: string; bank: string; onChange: (bank: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-ink">
      {label}
      <select name={name} value={bank} onChange={(e) => onChange(e.target.value)} className={`w-full font-normal ${selectClass}`}>
        {BANKS.map((b) => (<option key={b} value={b}>{b}</option>))}
      </select>
    </label>
  );
}

function NetBankingFields({ offers }: { offers?: Record<string, BankOfferNote> }) {
  const [bank, setBank] = useState(BANKS[0]);
  const offer = offers?.[bank];
  return (
    <div className="flex max-w-[420px] flex-col gap-2">
      <BankSelect name="bank" label="Choose your bank" bank={bank} onChange={setBank} />
      {offer ? <BankOfferLine offer={offer} /> : null}
    </div>
  );
}

function EmiFields({ emi, offers }: { emi?: PaymentSectionProps['emi']; offers?: Record<string, BankOfferNote> }) {
  const [bank, setBank] = useState(BANKS[0]);
  const offer = offers?.[bank];
  return (
    <div className="grid max-w-[520px] grid-cols-1 gap-3 sm:grid-cols-2">
      <BankSelect name="emiBank" label="Bank" bank={bank} onChange={setBank} />
      <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-ink">
        Tenure
        <select name="emiTenure" defaultValue="3" className={`w-full font-normal ${selectClass}`}>
          {emi?.length
            ? emi.map((t) => (<option key={t.months} value={t.months}>{t.months} months · {t.text}</option>))
            : ['3', '6', '9', '12'].map((t) => (<option key={t} value={t}>{t} months</option>))}
        </select>
      </label>
      {offer ? <div className="sm:col-span-2"><BankOfferLine offer={offer} /></div> : null}
      <p className={`sm:col-span-2 ${note}`}>
        {emi?.length ? 'No Cost EMI takes the bank’s interest off as a discount; longer plans carry it. ' : 'Interest and processing fees apply as per your bank. '}
        (Demo — no EMI is created.)
      </p>
    </div>
  );
}

function fields(method: string, curSymbol: string, defaultName: string, balance?: BalanceInfo) {
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
    case 'amazonpay':
      return balanceFields(balance);
    case 'upi':
      return (
        <div className="grid max-w-[420px] grid-cols-1 gap-2">
          <Input name="upiId" label="UPI ID" placeholder="name@okhdfcbank" defaultValue="aarav@okhdfcbank" />
          <p className={note}>A collect request would be sent to your UPI app. (Demo — nothing is sent.)</p>
        </div>
      );
    case 'cod':
      return (
        <p className={`max-w-[480px] rounded-input bg-surface-2 p-3 ${note}`}>
          Pay by cash, UPI or card to the delivery agent when your order arrives. <b className="text-ink">{curSymbol}0.00</b> is charged now.
        </p>
      );
    default:
      return null;
  }
}

/** The store balance pays the whole order: show what's there and where to top it up. */
function balanceFields(balance: BalanceInfo | undefined) {
  const link = 'font-semibold text-ink underline underline-offset-2 hover:text-accent-ink';
  if (!balance) {
    return <p className={`max-w-[420px] rounded-input bg-surface-2 p-3 ${note}`}>The order total is taken from your balance when you place the order.</p>;
  }
  return (
    <div className={`flex max-w-[420px] flex-col gap-1 rounded-input p-3 ${balance.short ? 'bg-warn-bg' : 'bg-surface-2'}`}>
      <p className={note}>Available balance: <b className="text-ink tabular-nums">{balance.text}</b></p>
      {balance.short ? (
        <p className={note}>
          That doesn&apos;t cover this order. <a href={balance.redeemHref} className={link}>Redeem a gift card</a>
          {balance.reloadHref ? <>, <a href={balance.reloadHref} className={link}>add money to your balance</a>,</> : null} or choose another payment method.
        </p>
      ) : (
        <p className={note}>The order total is taken from your balance when you place the order.</p>
      )}
    </div>
  );
}

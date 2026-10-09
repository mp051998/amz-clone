'use client';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { buyGiftCardAction, reloadBalanceAction, type BuyState } from '@/app/actions/gift-cards';
import { GIFT_CARD_QTY_MAX, GIFT_MESSAGE_MAX, RECIPIENT_MAX } from '@/lib/data/gift-card-purchases';
import { Alert } from '../primitives/Alert';
import { Button } from '../primitives/Button';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

export interface BuyFormProps {
  /** preset amounts, in whole currency units */
  denoms: number[];
  /** whole currency units */
  min: number;
  max: number;
  symbol: string;
  locale: string;
  /** prefilled from an occasion ("Happy birthday!") */
  defaultMessage?: string;
  /**
   * `reload`: the amount goes onto the shopper's own balance (no recipient or message), with
   * `reloadVerb` on the button ("Reload $50", amazon.in's "Add ₹1,000").
   */
  kind?: 'gift' | 'reload';
  reloadVerb?: string;
}

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" loading={pending} disabled={disabled}>
      {pending ? 'Opening secure checkout…' : label}
    </Button>
  );
}

/** Pick an amount (or type one), how many, who they're for and a message, then pay by card on Stripe. A reload asks for the amount only. */
export function BuyForm({ denoms, min, max, symbol, locale, defaultMessage = '', kind = 'gift', reloadVerb = 'Reload' }: BuyFormProps) {
  const reload = kind === 'reload';
  const [state, action] = useActionState<BuyState, FormData>(reload ? reloadBalanceAction : buyGiftCardAction, {});
  const id = useId();
  const [choice, setChoice] = useState<number | 'custom'>(denoms[1] ?? denoms[0]);
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [qty, setQty] = useState(1);
  const fmt = (n: number) => `${symbol}${n.toLocaleString(locale)}`;

  const typed = Number(custom.replace(/[^\d.]/g, ''));
  const amount = choice === 'custom' ? (custom.trim() && Number.isInteger(typed) ? typed : null) : choice;
  const inRange = amount !== null && amount >= min && amount <= max;
  const customError = choice === 'custom' && custom.trim() !== '' && !inRange ? `Enter a whole amount from ${fmt(min)} to ${fmt(max)}.` : '';
  const amountError = customError || (state.field === 'amount' ? state.error : '');

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="amountMinor" value={inRange ? amount * 100 : ''} />
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[14px] font-semibold text-ink">Amount</legend>
        <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', reload ? 'lg:grid-cols-5' : 'lg:grid-cols-6')}>
          {denoms.map((d) => (
            <label
              key={d}
              className={cn(
                'flex min-h-[72px] cursor-pointer flex-col items-center justify-center rounded-card border bg-surface p-3 text-ink transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink',
                choice === d ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink',
              )}
            >
              <input type="radio" name="denom" value={d} checked={choice === d} onChange={() => setChoice(d)} className="sr-only" />
              <span className="text-[22px] font-bold tabular-nums">{fmt(d)}</span>
            </label>
          ))}
          <label
            className={cn(
              'flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-card border border-dashed bg-surface p-3 text-ink transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink',
              choice === 'custom' ? 'border-ink ring-1 ring-ink' : 'border-line-3 hover:border-ink',
            )}
          >
            <input type="radio" name="denom" value="custom" checked={choice === 'custom'} onChange={() => setChoice('custom')} className="sr-only" />
            <span className="text-[16px] font-semibold">Custom</span>
            <span className="text-[13px] text-ink-3">{fmt(min)}–{fmt(max)}</span>
          </label>
        </div>
        {choice === 'custom' ? (
          <label htmlFor={`${id}-amount`} className="flex max-w-[240px] flex-col gap-1.5 text-[14px] font-semibold">
            Custom amount ({symbol})
            <input
              id={`${id}-amount`}
              inputMode="numeric"
              autoFocus
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={String(min * 10)}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? `${id}-amount-error` : undefined}
              className={cn(fieldClass, 'font-normal tabular-nums')}
            />
          </label>
        ) : null}
        {amountError ? <p id={`${id}-amount-error`} role="alert" className="m-0 text-[13px] text-bad">⚠ {amountError}</p> : null}
      </fieldset>

      {reload ? null : (
        <label htmlFor={`${id}-qty`} className="flex max-w-[160px] flex-col gap-1.5 text-[14px] font-semibold">
          Quantity
          <select
            id={`${id}-qty`}
            name="quantity"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className={cn(fieldClass, 'font-normal tabular-nums')}
          >
            {Array.from({ length: GIFT_CARD_QTY_MAX }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      )}

      {reload ? null : (
        <div className="grid gap-3 md:grid-cols-2">
          <label htmlFor="gift-to" className="flex flex-col gap-1.5 text-[14px] font-semibold">
            To <span className="font-normal text-ink-3">(optional)</span>
            <input id="gift-to" name="recipientName" maxLength={RECIPIENT_MAX} autoComplete="off" placeholder="Their name" className={cn(fieldClass, 'font-normal')} />
          </label>
          <label htmlFor="gift-message" className="flex flex-col gap-1.5 text-[14px] font-semibold md:row-span-2">
            Message <span className="font-normal text-ink-3">(optional)</span>
            <textarea
              id="gift-message"
              name="message"
              rows={3}
              maxLength={GIFT_MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enjoy!"
              className={cn(fieldClass, 'h-auto py-2.5 font-normal leading-normal')}
            />
            <span className="text-[12px] font-normal text-ink-3 tabular-nums">{message.length}/{GIFT_MESSAGE_MAX}</span>
          </label>
        </div>
      )}

      {state.error && state.field !== 'amount' ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        {reload ? (
          <Submit label={inRange ? `${reloadVerb} ${fmt(amount)}` : reloadVerb} disabled={!inRange} />
        ) : (
          <Submit
            label={qty > 1 ? (inRange ? `Buy ${qty} ${fmt(amount)} gift cards · ${fmt(amount * qty)}` : `Buy ${qty} gift cards`) : inRange ? `Buy ${fmt(amount)} gift card` : 'Buy gift card'}
            disabled={!inRange}
          />
        )}
        <span className="text-[13px] text-ink-3">
          {reload ? 'You’ll pay by card on Stripe’s secure page. It’s added to your balance once it’s paid.' : qty > 1
              ? 'You’ll pay by card on Stripe’s secure page. Each card gets its own code, here once it’s paid.'
              : 'You’ll pay by card on Stripe’s secure page. The code appears here once it’s paid.'}
        </span>
      </div>
    </form>
  );
}

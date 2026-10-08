'use client';
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markGiftBought } from '@/app/actions/collections';
import type { GiftMark as Mark } from '@/lib/data/collections';
import { useToast } from '../decision/Toast';
import { Button } from '../primitives/Button';
import { cn } from '../lib/cn';
import { selectClass } from '../lib/controls';

/**
 * A gift giver's "Mark as bought" on someone's shared list, so nobody buys it twice. Shows who has
 * it (you, or other givers); signed-out visitors are asked to sign in first. When the owner asked
 * for more than one, each giver marks how many they bought until the marks cover it.
 */
export function GiftMark({ token, productId, productName, mark, needed = 1, has = 0, yours = 0, signInHref }: {
  token: string;
  productId: string;
  productName: string;
  mark?: Mark;
  /** how many the owner asked for */
  needed?: number;
  /** how many givers marked bought, `yours` of them */
  has?: number;
  yours?: number;
  /** set when signed out */
  signInHref?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const id = useId();
  const left = Math.max(0, needed - has);
  const [count, setCount] = useState(1);

  const set = (bought: boolean, quantity?: number) =>
    start(async () => {
      const res = await markGiftBought(token, productId, bought, quantity);
      if ('error' in res) {
        if (res.error === 'not_authenticated' && signInHref) {
          router.push(signInHref);
          return;
        }
        toast(res.message ?? 'Couldn’t update that. Try again.');
        if (res.error === 'gift_already_bought' || res.error === 'gift_too_many') router.refresh();
        return;
      }
      toast(!bought ? 'No longer marked as bought' : quantity && needed > 1 ? `Marked ${quantity} as bought` : 'Marked as bought');
      router.refresh();
    });

  if (mark === 'you') {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="font-semibold text-good-strong">{needed > 1 && yours ? `✓ You bought ${yours}` : '✓ You bought this'}</span>
        <Button variant="link" onClick={() => set(false)} loading={pending} aria-label={`Undo: you bought ${productName}`} className="text-[13px]">
          Undo
        </Button>
      </span>
    );
  }
  if (mark === 'someone' || left === 0) {
    return <span className="text-[13px] font-semibold text-ink-2">{needed > 1 ? 'Bought by other gift givers' : 'Bought by another gift giver'}</span>;
  }
  if (signInHref) {
    return (
      <a href={signInHref} className="text-[13px] text-ink underline underline-offset-2">
        Sign in to mark it bought
      </a>
    );
  }
  if (left > 1) {
    const n = Math.min(count, left);
    return (
      <form
        className="flex flex-wrap items-center gap-2 text-[13px]"
        aria-label={`Mark how many ${productName} you bought`}
        onSubmit={(e) => {
          e.preventDefault();
          set(true, n);
        }}
      >
        <label htmlFor={`${id}-n`} className="text-ink-2">Bought some?</label>
        <select id={`${id}-n`} value={n} onChange={(e) => setCount(Number(e.target.value))} className={cn(selectClass, 'h-8 pl-2 pr-7 text-[13px]')}>
          {Array.from({ length: left }, (_, i) => i + 1).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <Button type="submit" variant="link" loading={pending} aria-label={`Mark ${productName} as bought`} className="text-[13px]">
          Mark as bought
        </Button>
      </form>
    );
  }
  return (
    <Button variant="link" onClick={() => set(true)} loading={pending} aria-label={`Mark ${productName} as bought`} className="self-start text-[13px]">
      Bought it? Mark as bought
    </Button>
  );
}

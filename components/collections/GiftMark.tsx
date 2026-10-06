'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markGiftBought } from '@/app/actions/collections';
import type { GiftMark as Mark } from '@/lib/data/collections';
import { useToast } from '../decision/Toast';
import { Button } from '../primitives/Button';

/**
 * A gift giver's "Mark as bought" on someone's shared list, so nobody buys it twice. Shows who has
 * it (you, or another giver); signed-out visitors are asked to sign in first.
 */
export function GiftMark({ token, productId, productName, mark, signInHref }: {
  token: string;
  productId: string;
  productName: string;
  mark?: Mark;
  /** set when signed out */
  signInHref?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const set = (bought: boolean) =>
    start(async () => {
      const res = await markGiftBought(token, productId, bought);
      if ('error' in res) {
        if (res.error === 'not_authenticated' && signInHref) {
          router.push(signInHref);
          return;
        }
        toast(res.message ?? 'Couldn’t update that. Try again.');
        if (res.error === 'gift_already_bought') router.refresh();
        return;
      }
      toast(bought ? 'Marked as bought' : 'No longer marked as bought');
      router.refresh();
    });

  if (mark === 'someone') {
    return <span className="text-[13px] font-semibold text-ink-2">Bought by another gift giver</span>;
  }
  if (mark === 'you') {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="font-semibold text-good-strong">✓ You bought this</span>
        <Button variant="link" onClick={() => set(false)} loading={pending} aria-label={`Undo: you bought ${productName}`} className="text-[13px]">
          Undo
        </Button>
      </span>
    );
  }
  if (signInHref) {
    return (
      <a href={signInHref} className="text-[13px] text-ink underline underline-offset-2">
        Sign in to mark it bought
      </a>
    );
  }
  return (
    <Button variant="link" onClick={() => set(true)} loading={pending} aria-label={`Mark ${productName} as bought`} className="self-start text-[13px]">
      Bought it? Mark as bought
    </Button>
  );
}

'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { moveCartItemToSaved } from '@/app/actions/collections';
import { swapCartLine } from '@/app/cart/actions';
import { useToast } from '../decision/Toast';
import { Button } from '../primitives/Button';
import { storeHref, type MarketId } from '../lib/store';

const textBtn = 'min-h-11 px-1 text-[14px] text-ink underline underline-offset-2 hover:text-accent-ink disabled:cursor-progress disabled:text-ink-4';

/** "Save for later" → the "Saved for later" collection (signed-out → sign in, then back to the cart). */
export function SaveForLater({ productId, name, market, signedIn }: { productId: string; name: string; market: MarketId; signedIn: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const signin = () => router.push(storeHref(market, `/signin?next=${encodeURIComponent('/cart')}`));

  const onClick = () => {
    if (!signedIn) return signin();
    start(async () => {
      try {
        const res = await moveCartItemToSaved(productId);
        if ('error' in res) {
          if (res.error === 'not_authenticated') return signin();
          toast(res.message ?? "Couldn't save that for later");
          return;
        }
        toast(`Moved to ${res.collectionName}`);
        router.refresh();
      } catch {
        toast("Couldn't save that for later — try again");
      }
    });
  };

  return (
    <button type="button" onClick={onClick} disabled={pending} className={textBtn} aria-label={`Save ${name} for later`}>
      Save for later
    </button>
  );
}

/** "Swap & save ₹800": replace the cart line with the cheaper alternative. */
export function SwapButton({ fromId, toId, amount }: { fromId: string; toId: string; amount: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const onClick = () =>
    start(async () => {
      const res = await swapCartLine(fromId, toId);
      if ('error' in res) {
        toast(res.message ?? "Couldn't swap that item");
        return;
      }
      toast(`Swapped · you saved ${amount}`);
      router.refresh();
    });
  return (
    <Button variant="dark" onClick={onClick} loading={pending}>
      Swap &amp; save {amount}
    </Button>
  );
}

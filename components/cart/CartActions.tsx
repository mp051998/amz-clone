'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { moveCartItemToSaved, moveSavedToCart, removeFromCollection } from '@/app/actions/collections';
import { swapCartLine } from '@/app/cart/actions';
import { useToast } from '../decision/Toast';
import { Button } from '../primitives/Button';
import { SeeOptions } from '../product/SeeOptions';
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

/** "Move to cart" / "Delete" on a "Saved for later" item. */
export function SavedItemActions({ collectionId, productId, name, canMove, optionsHref }: {
  collectionId: string;
  productId: string;
  name: string;
  canMove: boolean;
  /** it comes in sizes: "See options" on its page, where one is picked, in place of Move to cart */
  optionsHref?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const act = (fn: () => Promise<{ ok: true } | { error: string; message?: string }>, done: string, failed: string) =>
    start(async () => {
      try {
        const res = await fn();
        if ('error' in res) {
          toast(res.message ?? failed);
          return;
        }
        toast(done);
        router.refresh();
      } catch {
        toast(`${failed} — try again`);
      }
    });

  return (
    <>
      {canMove && optionsHref ? (
        <SeeOptions href={optionsHref} name={name} />
      ) : canMove ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => moveSavedToCart(collectionId, productId), 'Moved to cart', "Couldn't move that to your cart")}
          className="min-h-11 rounded-pill border border-ink bg-surface px-3.5 text-[14px] font-semibold text-ink hover:bg-surface-2 disabled:cursor-progress disabled:opacity-60"
          aria-label={`Move ${name} to cart`}
        >
          Move to cart
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => act(() => removeFromCollection(collectionId, productId), 'Removed from Saved for later', "Couldn't remove that")}
        className={textBtn}
        aria-label={`Delete ${name} from Saved for later`}
      >
        Delete
      </button>
    </>
  );
}

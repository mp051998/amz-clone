'use client';
import { useId, useOptimistic, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { addToCollection, createCollectionWith, removeFromCollection } from '@/app/actions/collections';
import type { ListChoice } from '@/lib/data/collections';
import { useToast } from '../decision/Toast';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { cn } from '../lib/cn';
import { fieldClass } from '../lib/controls';
import { storeHref, type MarketId } from '../lib/store';
import { usePopover } from '../lib/usePopover';

export interface AddToListProps {
  productId: string;
  productName: string;
  market: MarketId;
  /** the shopper's lists in this store, marked where this product is on them; null when signed out */
  lists: ListChoice[] | null;
}

type Change = { id: string; has: boolean };

/**
 * PDP "Add to List": a panel of the shopper's lists with a checkbox each (tick to add, untick to
 * take it off), and "New list" to make one with this product already on it. Signed-out shoppers
 * go to sign-in first.
 */
export function AddToList({ productId, productName, market, lists }: AddToListProps) {
  const { open, setOpen, close, trigger, panel } = usePopover();
  const [shown, change] = useOptimistic(lists ?? [], (state: ListChoice[], c: Change) =>
    state.map((l) => (l.id === c.id ? { ...l, has: c.has } : l)),
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const id = useId();

  const signin = () => {
    const here = `${window.location.pathname}${window.location.search}`;
    router.push(storeHref(market, `/signin?next=${encodeURIComponent(here)}`));
  };

  const onTrigger = () => {
    if (!lists) return signin();
    if (open) return close();
    setCreating(lists.length === 0);
    setError(null);
    setOpen(true);
  };

  const toggle = (l: ListChoice) =>
    start(async () => {
      change({ id: l.id, has: !l.has });
      const res = l.has ? await removeFromCollection(l.id, productId) : await addToCollection(l.id, productId);
      if ('error' in res) {
        if (res.error === 'not_authenticated') return signin();
        toast(res.message ?? "Couldn't update that list — try again");
        return;
      }
      toast(l.has ? `Removed from ${l.name}` : `Added to ${l.name}`);
    });

  const create = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '');
    start(async () => {
      const res = await createCollectionWith(name, productId);
      if ('error' in res) {
        if (res.error === 'not_authenticated') return signin();
        setError(res.error === 'duplicate' ? 'You already have a list with that name.' : res.message ?? "Couldn't make that list.");
        return;
      }
      setCreating(false);
      setError(null);
      toast(`Added to ${res.collection.name}`);
    });
  };

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={onTrigger}
        aria-expanded={lists ? open : undefined}
        aria-controls={open ? id : undefined}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-pill border border-line-3 bg-surface px-3 text-[14px] font-medium text-ink transition-colors hover:border-ink"
      >
        Add to List
        <span aria-hidden className="text-[11px] text-ink-3">▾</span>
      </button>
      {open ? (
        <div
          ref={panel}
          id={id}
          role="group"
          aria-label={`Add ${productName} to a list`}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-40 flex flex-col gap-2 rounded-card border border-line bg-surface p-3.5 text-ink shadow-hero"
        >
          {shown.length ? (
            <fieldset className="m-0 flex max-h-[264px] flex-col overflow-y-auto border-0 p-0">
              <legend className="mb-1 p-0 text-[13px] font-semibold text-ink-2">Your lists</legend>
              {shown.map((l) => (
                <Checkbox key={l.id} label={l.name} checked={l.has} onChange={() => toggle(l)} />
              ))}
            </fieldset>
          ) : (
            <p className="m-0 text-[14px] text-ink-2">You don’t have any lists yet. Make one to keep this for later or share it.</p>
          )}

          {creating ? (
            <form onSubmit={create} className="flex flex-col gap-1.5 border-t border-line pt-2.5">
              <label htmlFor={`${id}-name`} className="text-[14px] font-semibold">New list</label>
              <div className="flex gap-2">
                <input
                  id={`${id}-name`}
                  name="name"
                  required
                  maxLength={60}
                  placeholder="e.g. Birthday ideas"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-err` : undefined}
                  className={cn(fieldClass, 'min-w-0 flex-1', error && 'border-bad')}
                />
                <Button type="submit" variant="dark" size="sm" loading={pending}>Create</Button>
              </div>
              {error ? (
                <span id={`${id}-err`} className="flex gap-1.5 text-[13px] text-bad"><span aria-hidden>⚠</span>{error}</span>
              ) : null}
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="min-h-11 rounded-input border border-dashed border-line-3 bg-transparent px-3 text-left text-[14px] text-ink hover:border-ink"
            >
              + New list
            </button>
          )}

          <a href={storeHref(market, '/collections')} onClick={() => close(false)} className="text-[14px] text-ink underline underline-offset-2">
            View your lists
          </a>
        </div>
      ) : null}
    </div>
  );
}

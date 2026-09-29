'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleSave } from '@/app/actions/collections';
import { cn } from '../lib/cn';
import { storeHref, type MarketId } from '../lib/store';
import { useCompare } from './Compare';
import { useToast } from './Toast';

export type ToggleSaveResult = { saved: boolean; collectionName: string } | { error: 'not_authenticated' };
export type ToggleSaveAction = (productId: string) => Promise<ToggleSaveResult>;

export interface SaveButtonProps {
  productId: string;
  /** server-known saved state (initial). */
  saved: boolean;
  /** product name for the accessible label. */
  name?: string;
  /** override the server action (tests / storybook); defaults to `toggleSave` from app/actions/collections. */
  action?: ToggleSaveAction;
  /** market for the sign-in redirect prefix; defaults to the CompareProvider's market. */
  market?: MarketId;
  className?: string;
}

/**
 * "♡ Save" / "♥ Saved" pill (design.md §5 Save). Optimistic; reverts on failure. Signed-out viewers
 * are sent to sign-in with `next` set to the current page.
 */
export function SaveButton({ productId, saved: initial, name, action = toggleSave, market, className }: SaveButtonProps) {
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const compare = useCompare();
  const mkt = market ?? compare.market;

  const onClick = () => {
    const prev = saved;
    setSaved(!prev);
    start(async () => {
      try {
        const res = await action(productId);
        if ('error' in res) {
          setSaved(prev);
          // read the URL at click time (no useSearchParams → no Suspense requirement on static pages)
          const here = `${window.location.pathname}${window.location.search}`;
          router.push(storeHref(mkt, `/signin?next=${encodeURIComponent(here)}`));
          return;
        }
        setSaved(res.saved);
        toast(res.saved ? `Saved to ${res.collectionName} · price tracking on` : 'Removed from collections');
      } catch {
        setSaved(prev);
        toast("Couldn't update your collections — try again");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={saved}
      aria-label={name ? `${saved ? 'Saved' : 'Save'} ${name}` : undefined}
      className={cn(
        'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-pill border border-line-3 bg-surface px-3 text-[14px] font-medium text-ink transition-colors hover:border-ink disabled:cursor-progress',
        className,
      )}
    >
      <span aria-hidden>{saved ? '♥' : '♡'}</span>
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}

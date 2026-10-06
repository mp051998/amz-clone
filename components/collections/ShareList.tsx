'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { shareCollection, unshareCollection } from '@/app/actions/collections';
import { useToast } from '../decision/Toast';
import { Button } from '../primitives/Button';
import { CopyField } from '../primitives/CopyField';
import { storeHref, type MarketId } from '../lib/store';

export interface ShareListProps {
  id: string;
  name: string;
  market: MarketId;
  /** the list's link while it's shared */
  url: string | null;
}

/**
 * "Share" turns on a link anyone can open (/lists/<token>) and shows it with Copy; "Stop sharing"
 * turns it off, and the old link stops working.
 */
export function ShareList({ id, name, market, url }: ShareListProps) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const run = (fn: () => Promise<object>, done: string) =>
    start(async () => {
      const res = await fn();
      if ('error' in res) {
        if (res.error === 'not_authenticated') {
          router.push(storeHref(market, `/signin?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`));
          return;
        }
        setError("Couldn't change sharing. Try again.");
        return;
      }
      setError(null);
      toast(done);
      router.refresh();
    });

  if (!url) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => shareCollection(id), 'Link ready to share')}>
          Share list
        </Button>
        <span className="text-[13px] text-ink-3">Get a link anyone can open to see {name} and add things to their cart.</span>
        {error ? <span role="alert" className="text-[13px] text-bad">⚠ {error}</span> : null}
      </div>
    );
  }
  return (
    <section aria-label="Sharing" className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-[15px] font-semibold">Shared by link</strong>
        <div className="flex flex-wrap items-center gap-3 text-[14px]">
          <a href={url} className="text-ink underline underline-offset-2">View as others see it</a>
          <Button variant="link" size="sm" disabled={pending} onClick={() => run(() => unshareCollection(id), 'Sharing turned off')}>
            Stop sharing
          </Button>
        </div>
      </div>
      <CopyField value={url} label="Link to this list" copied="Link copied" />
      <span className="text-[13px] text-ink-3">Anyone with the link sees the list’s name, your first name and what’s in it. Your note and the prices you saved at stay private.</span>
      {error ? <span role="alert" className="text-[13px] text-bad">⚠ {error}</span> : null}
    </section>
  );
}

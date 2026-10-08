'use client';
import { useId, useState } from 'react';
import { Checkbox } from '../primitives/Checkbox';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

/**
 * "This order contains a gift" with an optional note for the recipient (checkout Delivery step),
 * and gift wrap when the store offers it (`wrapFee`, the per-item price as shown). The wrap box has
 * id `gift-wrap` so the order summary can follow it with CSS alone. `initial` ticks the gift box
 * to begin with (the cart's "This order contains a gift", `/checkout?gift=1`).
 */
export function GiftOption({ max, wrapFee, initial = false }: { max: number; wrapFee?: string; initial?: boolean }) {
  const [gift, setGift] = useState(initial);
  const [wrap, setWrap] = useState(false);
  const [note, setNote] = useState('');
  const noteId = useId();
  return (
    <div className="flex flex-col gap-1.5 border-t border-line-2 pt-2">
      <Checkbox name="gift" label="This order contains a gift" checked={gift} onChange={(e) => setGift(e.target.checked)} />
      {gift ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={noteId} className="text-[14px] font-semibold">Gift message (optional)</label>
          <textarea
            id={noteId}
            name="giftMessage"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={max}
            rows={3}
            placeholder="Happy birthday! Love, Sam"
            aria-describedby={`${noteId}-hint`}
            className={cn(fieldClass, 'h-auto py-2.5 leading-normal')}
          />
          <span id={`${noteId}-hint`} className="text-[13px] text-ink-3">
            {max - note.length} characters left · We pack the note with the gift.
          </span>
          {wrapFee ? (
            <Checkbox
              id="gift-wrap"
              name="giftWrap"
              label={`Gift-wrap the items (${wrapFee} per item)`}
              checked={wrap}
              onChange={(e) => setWrap(e.target.checked)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

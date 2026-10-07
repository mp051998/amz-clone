'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Input } from '@/components/primitives/Input';
import { buttonClasses } from '@/components/primitives/Button';
import { PROMO_CODE_MAX } from '@/lib/promo';

export interface PromoCodeProps {
  /** this checkout's path, and the rest of its query (Buy Now's product) */
  checkoutPath: string;
  query: string;
  /** the code priced into the summary; it goes with the order as `promo` */
  applied?: { code: string; description: string; savings: string };
  /** a code that was tried and didn't apply, and why */
  tried?: { code: string; problem: string };
}

/**
 * "Add a promotion code" in the checkout summary. Applying or removing a code reloads the
 * checkout with `?promo=` so the database prices it; what's filled in above stays as it is.
 * The field has no name and Enter applies it, so a typed code never places the order.
 */
export function PromoCode({ checkoutPath, query, applied, tried }: PromoCodeProps) {
  const router = useRouter();
  const [code, setCode] = useState(tried?.code ?? '');
  const [pending, start] = useTransition();
  const go = (promo: string | null) => {
    const q = new URLSearchParams(query);
    q.delete('promo');
    if (promo) q.set('promo', promo);
    const s = q.toString();
    start(() => router.replace(s ? `${checkoutPath}?${s}` : checkoutPath, { scroll: false }));
  };
  const apply = () => {
    const c = code.trim().toUpperCase();
    if (c) go(c);
  };

  if (applied) {
    return (
      <div className="flex flex-col gap-0.5 rounded-image bg-good-bg px-3 py-2 text-[14px]">
        <input type="hidden" name="promo" value={applied.code} />
        <span className="font-semibold text-good-strong">
          {applied.code} applied · −{applied.savings}
        </span>
        <span className="text-ink-2">{applied.description}</span>
        <button
          type="button"
          onClick={() => go(null)}
          disabled={pending}
          className="self-start border-0 bg-transparent p-0 text-[13px] text-ink underline underline-offset-2"
        >
          {pending ? 'Removing…' : 'Remove'}
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <Input
          label="Add a promotion code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={PROMO_CODE_MAX}
          error={tried?.problem}
        />
      </div>
      <button type="button" onClick={apply} disabled={pending || !code.trim()} className={`${buttonClasses({ variant: 'secondary' })} mt-[26px] flex-none`}>
        {pending ? 'Applying…' : 'Apply'}
      </button>
    </div>
  );
}

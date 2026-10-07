'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { reportProductIssue } from '@/app/actions/product-report';
import type { ProductReport } from '@/lib/data/product-reports';
import { PRODUCT_REPORT_LABELS, PRODUCT_REPORT_REASONS, REPORT_DETAILS_MAX, REPORT_OTHER_MIN, reportInputError, type ProductReportReason } from '@/lib/product-reports';
import { Button } from '../primitives/Button';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

export interface ReportIssueProps {
  productId: string;
  signedIn: boolean;
  signinHref: string;
  /** the shopper's open report on this product, if they have one */
  open: ProductReport | null;
  locale: string;
  timeZone: string;
}

const link = 'border-0 bg-transparent p-0 text-left text-[14px] text-ink underline underline-offset-2';

/** PDP "Report an issue with this product": pick what's wrong, add a note, send it to the store. */
export function ReportIssue({ productId, signedIn, signinHref, open, locale, timeZone }: ReportIssueProps) {
  const [mine, setMine] = useState(open);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState<ProductReportReason | ''>(open?.reason ?? '');
  const [details, setDetails] = useState(open?.details ?? '');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<'new' | 'updated' | null>(null);
  const [pending, start] = useTransition();
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(iso));

  if (!signedIn) {
    return (
      <a href={signinHref} className="self-start text-[14px] text-ink underline underline-offset-2">
        Sign in to report an issue with this product
      </a>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const bad = reportInputError(reason, details);
    if (bad) return setError(bad.message);
    setError('');
    start(async () => {
      const res = await reportProductIssue(productId, { reason, details });
      if (!res.ok) return setError(res.message);
      setMine(res.report);
      setSent(res.updated ? 'updated' : 'new');
      setEditing(false);
    });
  };

  if (!editing) {
    return (
      <div className="flex flex-col gap-1.5 text-[14px]">
        {sent ? (
          <p role="status" className="m-0 text-good-strong">
            {sent === 'updated' ? 'Your report is updated.' : 'Thanks for telling us.'} Our team looks at every report, though we can’t reply to each one.
          </p>
        ) : mine ? (
          <p className="m-0 text-ink-2">You reported an issue with this product on {day(mine.createdAt)}: {PRODUCT_REPORT_LABELS[mine.reason].toLowerCase()}. We’re looking into it.</p>
        ) : null}
        <button type="button" onClick={() => { setEditing(true); setSent(null); }} className={cn(link, 'self-start')}>
          {mine ? 'Update your report' : 'Report an issue with this product'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-labelledby="report-h" className="flex max-w-[560px] flex-col gap-3 rounded-card border border-line bg-surface p-[18px]">
      <h3 id="report-h" className="m-0 text-[16px] font-semibold">{mine ? 'Update your report' : 'Report an issue with this product'}</h3>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[14px] font-semibold">What’s wrong?</legend>
        {PRODUCT_REPORT_REASONS.map((r) => (
          <label key={r} className="flex items-center gap-2.5 text-[14px]">
            <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-ink" />
            {PRODUCT_REPORT_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <label htmlFor="report-details" className="flex flex-col gap-1.5 text-[14px] font-semibold">
        <span>Tell us more <span className="font-normal text-ink-3">{reason === 'other' ? `(at least ${REPORT_OTHER_MIN} characters)` : '(optional)'}</span></span>
        <textarea
          id="report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={REPORT_DETAILS_MAX}
          rows={3}
          placeholder="e.g. The listing says 2 batteries are included, but the box has none."
          className={cn(fieldClass, 'h-auto py-2.5 font-normal leading-normal')}
        />
      </label>
      <span className="text-[12px] text-ink-3 tabular-nums">{details.trim().length}/{REPORT_DETAILS_MAX}</span>
      {error ? <p role="alert" className="m-0 text-[13px] text-bad">⚠ {error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={pending}>{mine ? 'Update report' : 'Send report'}</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => { setEditing(false); setError(''); }}>Cancel</Button>
      </div>
    </form>
  );
}

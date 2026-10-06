import { buttonClasses } from '../primitives/Button';
import { Stars } from '../primitives/Stars';
import { cn } from '../lib/cn';
import { fieldClass } from '../lib/controls';
import { FEEDBACK_COMMENT_MAX, type SellerFeedback as Feedback } from '@/lib/data/seller-feedback';

type FormAction = (formData: FormData) => void | Promise<void>;

export interface SellerRow {
  seller: string;
  feedback?: Feedback;
  /** set while the order's sellers can still be rated */
  rate?: FormAction;
  remove?: FormAction;
}

const chip =
  'flex cursor-pointer items-center gap-1 rounded-input border border-line bg-surface px-3 py-1.5 text-[14px] text-ink hover:border-ink has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink';

function YesNo({ name, legend, value }: { name: string; legend: string; value: boolean | null | undefined }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[14px] font-semibold text-ink">{legend} <span className="font-normal text-ink-3">(optional)</span></legend>
      <div className="flex gap-2">
        <label className={chip}>
          <input type="radio" name={name} value="yes" defaultChecked={value === true} className="sr-only" />
          Yes
        </label>
        <label className={chip}>
          <input type="radio" name={name} value="no" defaultChecked={value === false} className="sr-only" />
          No
        </label>
      </div>
    </fieldset>
  );
}

function FeedbackForm({ seller, feedback, action, commentId }: { seller: string; feedback?: Feedback; action: FormAction; commentId: string }) {
  return (
    <form action={action} className="mt-3 flex flex-col gap-3.5">
      <fieldset className="m-0 flex flex-col border-0 p-0">
        <legend className="mb-1.5 p-0 text-[14px] font-semibold text-ink">How would you rate {seller}?</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={chip}>
              <input type="radio" name="rating" value={n} required defaultChecked={feedback?.rating === n} className="sr-only" />
              <span aria-hidden className="text-star">★</span>
              {n === 1 ? '1 star' : `${n} stars`}
            </label>
          ))}
        </div>
      </fieldset>
      <YesNo name="onTime" legend="Did it arrive on time?" value={feedback?.arrivedOnTime} />
      <YesNo name="asDescribed" legend="Was the item as described?" value={feedback?.asDescribed} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={commentId} className="text-[14px] font-semibold text-ink">Comments <span className="font-normal text-ink-3">(optional)</span></label>
        <textarea
          id={commentId}
          name="comment"
          rows={3}
          maxLength={FEEDBACK_COMMENT_MAX}
          defaultValue={feedback?.comment ?? ''}
          placeholder="How was buying from this seller?"
          className={cn(fieldClass, 'h-auto py-2.5 leading-normal')}
        />
      </div>
      <button type="submit" className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} self-start`}>
        {feedback ? 'Update feedback' : 'Submit feedback'}
      </button>
    </form>
  );
}

const answer = (v: boolean | null, yes: string, no: string) => (v === true ? yes : v === false ? no : null);

/**
 * "Leave seller feedback" on a delivered order: one row per seller, with the shopper's rating once
 * given (change or remove it while the window is open).
 */
export function SellerFeedbackSection({ rows, openUntil }: { rows: SellerRow[]; openUntil?: string | null }) {
  if (!rows.length) return null;
  return (
    <section id="seller-feedback" className="overflow-hidden rounded-panel border border-line bg-surface" aria-labelledby="seller-feedback-h">
      <div className="flex flex-col gap-0.5 px-[18px] pb-1 pt-4">
        <h2 id="seller-feedback-h" className="m-0 text-[16px] font-semibold">Seller feedback</h2>
        {openUntil ? <p className="m-0 text-[13px] text-ink-3">Rate the seller until {openUntil}. Your rating and comment show on the seller’s page, without your name.</p> : null}
      </div>
      {rows.map(({ seller, feedback, rate, remove }, i) => {
        const notes = feedback
          ? [answer(feedback.arrivedOnTime, 'Arrived on time', 'Arrived late'), answer(feedback.asDescribed, 'As described', 'Not as described')].filter(Boolean)
          : [];
        return (
          <div key={seller} className="flex flex-col gap-1.5 border-t border-line-2 px-[18px] py-3.5 first-of-type:border-t-0">
            <span className="text-[14px] text-ink-2">Sold by <span className="font-semibold text-ink">{seller}</span></span>
            {feedback ? (
              <>
                <Stars rating={feedback.rating} size={14} />
                {notes.length ? <span className="text-[13px] text-ink-2">{notes.join(' · ')}</span> : null}
                {feedback.comment ? <p className="m-0 whitespace-pre-line text-[14px] text-ink">{feedback.comment}</p> : null}
              </>
            ) : null}
            {rate ? (
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <details className="min-w-0 flex-[1_1_280px]">
                  <summary className="cursor-pointer text-[14px] font-semibold text-ink">{feedback ? 'Change your feedback' : 'Leave seller feedback'}</summary>
                  <FeedbackForm seller={seller} feedback={feedback} action={rate} commentId={`seller-feedback-comment-${i}`} />
                </details>
                {feedback && remove ? (
                  <form action={remove}>
                    <button type="submit" className="border-0 bg-transparent p-0 text-[14px] text-ink underline underline-offset-2" aria-label={`Remove your feedback for ${seller}`}>
                      Remove
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

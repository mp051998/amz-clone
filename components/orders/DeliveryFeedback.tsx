import { cn } from '../lib/cn';
import { fieldClass } from '../lib/controls';
import { BAD_DELIVERY, DELIVERY_COMMENT_MAX, GOOD_DELIVERY, reasonLabel, type DeliveryFeedback as Feedback } from '@/lib/data/delivery-feedback';
import { SubmitButton } from '@/components/primitives/SubmitButton';

type FormAction = (formData: FormData) => void | Promise<void>;

const chip =
  'flex cursor-pointer items-center gap-1.5 rounded-input border border-line bg-surface px-3 py-1.5 text-[14px] text-ink hover:border-ink has-[:checked]:border-ink has-[:checked]:ring-1 has-[:checked]:ring-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink';

function Thumb({ up }: { up: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={up ? undefined : 'rotate-180'}>
      <path d="M7 10v11H3V10h4Zm0 0 4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.3 8A2 2 0 0 1 18.2 21H7" />
    </svg>
  );
}

function Reasons({ legend, reasons, chosen, show }: { legend: string; reasons: Record<string, string>; chosen: readonly string[]; show: string }) {
  return (
    <fieldset className={cn('m-0 hidden flex-col border-0 p-0', show)}>
      <legend className="mb-1.5 p-0 text-[14px] font-semibold text-ink">{legend} <span className="font-normal text-ink-3">(optional)</span></legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(reasons).map(([key, label]) => (
          <label key={key} className={chip}>
            <input type="checkbox" name="reasons" value={key} defaultChecked={chosen.includes(key)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FeedbackForm({ feedback, action }: { feedback: Feedback | null; action: FormAction }) {
  const chosen = feedback?.reasons ?? [];
  return (
    <form action={action} className="group mt-3 flex flex-col gap-3.5">
      <fieldset className="m-0 flex flex-col border-0 p-0">
        <legend className="mb-1.5 p-0 text-[14px] font-semibold text-ink">How was your delivery?</legend>
        <div className="flex flex-wrap gap-2">
          <label className={chip}>
            <input id="delivery-up" type="radio" name="rating" value="up" required defaultChecked={feedback?.positive === true} className="sr-only" />
            <Thumb up />
            Good
          </label>
          <label className={chip}>
            <input id="delivery-down" type="radio" name="rating" value="down" required defaultChecked={feedback?.positive === false} className="sr-only" />
            <Thumb up={false} />
            Not good
          </label>
        </div>
      </fieldset>
      <Reasons legend="What went well?" reasons={GOOD_DELIVERY} chosen={chosen} show="group-has-[#delivery-up:checked]:flex" />
      <Reasons legend="What went wrong?" reasons={BAD_DELIVERY} chosen={chosen} show="group-has-[#delivery-down:checked]:flex" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="delivery-feedback-comment" className="text-[14px] font-semibold text-ink">Comments <span className="font-normal text-ink-3">(optional)</span></label>
        <textarea
          id="delivery-feedback-comment"
          name="comment"
          rows={3}
          maxLength={DELIVERY_COMMENT_MAX}
          defaultValue={feedback?.comment ?? ''}
          placeholder="Tell us about the delivery"
          className={cn(fieldClass, 'h-auto py-2.5 leading-normal')}
        />
      </div>
      <SubmitButton variant="secondary" size="sm" className="self-start">
        {feedback ? 'Update feedback' : 'Submit feedback'}
      </SubmitButton>
    </form>
  );
}

/**
 * "How was your delivery?" on a delivered order: a thumbs up or down with what went well or wrong,
 * which the shopper can change or remove while the window is open (`rate` set).
 */
export function DeliveryFeedbackSection({ feedback, rate, remove, openUntil }: { feedback: Feedback | null; rate?: FormAction; remove?: FormAction; openUntil?: string | null }) {
  if (!feedback && !rate) return null;
  return (
    <section id="delivery-feedback" className="overflow-hidden rounded-panel border border-line bg-surface" aria-labelledby="delivery-feedback-h">
      <div className="flex flex-col gap-1.5 px-[18px] py-4">
        <h2 id="delivery-feedback-h" className="m-0 text-[16px] font-semibold">Delivery feedback</h2>
        {openUntil ? <p className="m-0 text-[13px] text-ink-3">Tell us how the delivery went until {openUntil}. Only we see it.</p> : null}
        {feedback ? (
          <>
            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
              <Thumb up={feedback.positive} />
              {feedback.positive ? 'You said the delivery was good' : 'You said the delivery wasn’t good'}
            </span>
            {feedback.reasons.length ? <span className="text-[13px] text-ink-2">{feedback.reasons.map(reasonLabel).join(' · ')}</span> : null}
            {feedback.comment ? <p className="m-0 whitespace-pre-line text-[14px] text-ink">{feedback.comment}</p> : null}
          </>
        ) : null}
        {rate ? (
          <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
            <details className="min-w-0 flex-[1_1_280px]" open={!feedback}>
              <summary className="cursor-pointer text-[14px] font-semibold text-ink">{feedback ? 'Change your feedback' : 'Leave delivery feedback'}</summary>
              <FeedbackForm feedback={feedback} action={rate} />
            </details>
            {feedback && remove ? (
              <form action={remove}>
                <SubmitButton bare className="border-0 bg-transparent p-0 text-[14px] text-ink underline underline-offset-2" aria-label="Remove your delivery feedback">
                  Remove
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

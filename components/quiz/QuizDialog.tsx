'use client';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { buildProfileAction } from '@/app/actions/ai';
import { decisionConfig, emptyQuizAnswers, quizFor } from '@/lib/decision/attributes';
import { encodeWeights, writeDecisionParams } from '@/lib/decision/params';
import type { PriorityProfile, QuizAnswers, QuizQuestion } from '@/lib/decision/types';
import { cn } from '../lib/cn';
import { storeHref, type MarketId } from '../lib/store';
import { PriorityDots, LEVEL_TEXT } from '../decision/PriorityDots';
import { useToast } from '../decision/Toast';
import { encodeProfile, PROFILE_COOKIE, PROFILE_MAX_AGE, type StoredProfile } from './profileCookie';

export interface QuizCategory {
  slug: string;
  name: string;
}

export interface QuizButtonProps {
  market: MarketId;
  /** category to tune; null → the dialog asks first (home). */
  category: string | null;
  /** choices for the category step (only used when `category` is null). */
  categories?: QuizCategory[];
  /** current /s query string (without "?") to keep keywords/filters on Apply. */
  baseQuery?: string;
  /** current budget ceiling, passed to the profile builder. */
  budgetMinor?: number | null;
  /** open straight on the result step for this stored profile ("See why"). */
  initial?: StoredProfile | null;
  className?: string;
  children: ReactNode;
}

type Step = 'category' | number | 'loading' | 'result';

const FOCUSABLE = 'button:not([disabled]), [href], textarea, input, select, [tabindex]:not([tabindex="-1"])';
const MIN_LOADING_MS = 700;

/** Trigger button + "Tune my priorities" dialog (design.md §5 Quiz dialog). */
export function QuizButton({ market, category, categories = [], baseQuery = '', budgetMinor = null, initial = null, className, children }: QuizButtonProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);
  return (
    <>
      <button ref={trigger} type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open ? (
        <QuizDialog
          market={market}
          category={category}
          categories={categories}
          baseQuery={baseQuery}
          budgetMinor={budgetMinor}
          initial={initial}
          onClose={close}
        />
      ) : null}
    </>
  );
}

interface QuizDialogProps extends Omit<QuizButtonProps, 'className' | 'children'> {
  onClose: () => void;
}

function echoLines(q: QuizQuestion[], a: QuizAnswers): string[] {
  const out: string[] = [];
  if (a.use.length) out.push(`Mostly for: ${a.use.join(', ').toLowerCase()}`);
  if (a.duration) out.push(`${q[1].title.replace(/\?$/, '')}: ${a.duration.toLowerCase()}`);
  if (a.priceVsQuality) out.push(a.priceVsQuality);
  if (a.pain.length) out.push(`Avoiding: ${a.pain.join(', ').toLowerCase()}`);
  if (a.note.trim()) out.push(`Noted: “${a.note.trim().slice(0, 80)}${a.note.trim().length > 80 ? '…' : ''}”`);
  if (!out.length) out.push('No strong preferences — keeping things balanced');
  return out;
}

function QuizDialog({ market, category, categories = [], baseQuery = '', budgetMinor = null, initial, onClose }: QuizDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const configured = categories.filter((c) => decisionConfig(c.slug).category === c.slug);
  const [cat, setCat] = useState<string>(initial?.category ?? category ?? (configured.some((c) => c.slug === 'electronics') ? 'electronics' : configured[0]?.slug ?? 'electronics'));
  const [step, setStep] = useState<Step>(initial ? 'result' : category ? 0 : 'category');
  const [answers, setAnswers] = useState<QuizAnswers>(initial?.answers ?? emptyQuizAnswers());
  const [profile, setProfile] = useState<PriorityProfile | null>(initial?.profile ?? null);
  const [mounted, setMounted] = useState(false);
  const questions = quizFor(cat);
  const cfg = decisionConfig(cat);

  useEffect(() => setMounted(true), []);

  // lock page scroll, close on Escape
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // move focus into the panel on open and on every step change
  useEffect(() => {
    if (!mounted) return;
    const el = panel.current;
    const heading = el?.querySelector<HTMLElement>('h2');
    (heading ?? el)?.focus();
  }, [mounted, step]);

  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const run = async () => {
    setStep('loading');
    const started = Date.now();
    let result: PriorityProfile;
    try {
      result = await buildProfileAction(cat, answers, budgetMinor);
    } catch {
      toast("Couldn't work that out — try again");
      setStep(questions.length - 1);
      return;
    }
    const wait = MIN_LOADING_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    setProfile(result);
    setStep('result');
  };

  const apply = () => {
    if (!profile) return;
    const stored: StoredProfile = { category: cat, profile, answers: { ...answers, note: answers.note.slice(0, 200) } };
    try {
      document.cookie = `${PROFILE_COOKIE}=${encodeProfile(stored)}; path=/; max-age=${PROFILE_MAX_AGE}; samesite=lax`;
    } catch {
      /* cookies blocked: the ranking still applies through the URL */
    }
    const base = new URLSearchParams(baseQuery);
    if (base.get('dept') !== cat) base.set('dept', cat);
    const out = writeDecisionParams({ preset: null, sort: 'match' }, cat, base);
    out.set('preset', 'ai');
    out.set('w', encodeWeights(profile.weights, cat));
    out.delete('page');
    onClose();
    router.push(storeHref(market, `/s?${out.toString().replace(/%2C/gi, ',')}`));
    toast('Results re-ranked for your priorities');
  };

  const qIndex = typeof step === 'number' ? step : step === 'category' ? -1 : questions.length;
  const kicker =
    step === 'category'
      ? 'Tune my priorities · first, a category'
      : typeof step === 'number'
        ? `Tune my priorities · step ${step + 1} of ${questions.length}`
        : step === 'loading'
          ? 'Tune my priorities · working'
          : 'Tune my priorities · your result';

  const q = typeof step === 'number' ? questions[step] : null;
  const value = q ? answers[q.id] : null;
  const isSelected = (opt: string) => (Array.isArray(value) ? value.includes(opt) : value === opt);
  const pick = (opt: string) => {
    if (!q) return;
    setAnswers((a) => {
      if (q.multi) {
        const list = a[q.id] as string[];
        return { ...a, [q.id]: list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt] };
      }
      return { ...a, [q.id]: a[q.id] === opt ? null : opt };
    });
  };
  const canNext = !q || q.multi || q.options.length === 0 || value != null;
  const isLast = typeof step === 'number' && step === questions.length - 1;
  const next = () => {
    if (step === 'category') return setStep(0);
    if (typeof step !== 'number') return;
    if (isLast) void run();
    else setStep(step + 1);
  };
  const back = () => {
    if (typeof step !== 'number') return;
    if (step === 0) { if (!category) setStep('category'); return; }
    setStep(step - 1);
  };
  const showBack = (typeof step === 'number' && (step > 0 || !category));
  const nextLabel = step === 'category'
    ? 'Next'
    : isLast
      ? 'See my priorities'
      : q?.multi && !(value as string[]).length
        ? 'Skip'
        : 'Next';

  const rows = profile
    ? cfg.attributes
        .map((a, i) => ({ a, i, w: profile.weights[a.key] ?? 0 }))
        .sort((x, y) => y.w - x.w || x.i - y.i)
    : [];

  const optionClass = (on: boolean) =>
    cn(
      'flex min-h-14 items-center gap-2.5 rounded-card border-[1.5px] p-3.5 text-left text-[15px] font-medium transition-colors',
      on ? 'border-ink bg-ink text-on-ink' : 'border-line-3 bg-surface text-ink hover:border-ink',
    );

  const body = (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-scrim md:items-center md:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trap}
        className="flex max-h-[92vh] w-full max-w-[640px] flex-col gap-5 overflow-auto rounded-t-[18px] bg-bg p-6 outline-none md:max-h-full md:rounded-tray"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">{kicker}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-line-3 bg-surface text-[18px] hover:border-ink">×</button>
        </div>
        <div className="flex gap-1" aria-hidden>
          {questions.map((qq, i) => (
            <span key={qq.id} className={cn('h-1 flex-1 rounded-[2px]', i <= qIndex ? 'bg-ink' : 'bg-surface-4')} />
          ))}
        </div>

        {step === 'category' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <h2 id={titleId} tabIndex={-1} className="m-0 text-[clamp(22px,3vw,26px)] font-semibold leading-tight outline-none">What are you shopping for?</h2>
              <span className="text-[14px] text-ink-2">We&apos;ll ask five quick questions about it.</span>
            </div>
            <div role="radiogroup" aria-labelledby={titleId} className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
              {configured.map((c) => (
                <button key={c.slug} type="button" role="radio" aria-checked={cat === c.slug} onClick={() => setCat(c.slug)} className={optionClass(cat === c.slug)}>
                  <Mark on={cat === c.slug} multi={false} />
                  {c.name}
                </button>
              ))}
            </div>
            <Footer showBack={false} onBack={back} onNext={next} nextLabel={nextLabel} canNext />
          </>
        ) : null}

        {q ? (
          <>
            <div className="flex flex-col gap-1.5">
              <h2 id={titleId} tabIndex={-1} className="m-0 text-[clamp(22px,3vw,26px)] font-semibold leading-tight outline-none [text-wrap:pretty]">{q.title}</h2>
              <span className="text-[14px] text-ink-2">{q.sub}</span>
            </div>
            {q.options.length ? (
              <div role={q.multi ? 'group' : 'radiogroup'} aria-labelledby={titleId} className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                {q.options.map((o) => {
                  const on = isSelected(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      role={q.multi ? 'checkbox' : 'radio'}
                      aria-checked={on}
                      onClick={() => pick(o)}
                      className={optionClass(on)}
                    >
                      <Mark on={on} multi={q.multi} />
                      {o}
                    </button>
                  );
                })}
              </div>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="sr-only">{q.title}</span>
                <textarea
                  value={answers.note}
                  onChange={(e) => setAnswers((a) => ({ ...a, note: e.target.value.slice(0, 400) }))}
                  rows={4}
                  placeholder={cfg.category === 'electronics' ? 'e.g. I wear glasses, and I fly twice a month' : 'e.g. It’s a gift, and it needs to last'}
                  className="resize-y rounded-card border border-line-3 bg-surface p-3.5 text-[16px] leading-[1.45] hover:border-ink-3 focus:border-ink"
                />
              </label>
            )}
            <Footer showBack={showBack} onBack={back} onNext={next} nextLabel={nextLabel} canNext={canNext} />
          </>
        ) : null}

        {step === 'loading' ? (
          <div className="flex flex-col gap-3.5 pb-5 pt-3" aria-live="polite">
            <h2 id={titleId} tabIndex={-1} className="m-0 text-[24px] font-semibold outline-none">Working out what matters to you…</h2>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {echoLines(questions, answers).map((t) => (
                <li key={t} className="flex gap-2 text-[14px] text-ink-2"><span aria-hidden className="font-bold text-good">✓</span>{t}</li>
              ))}
            </ul>
            <div className="h-1 overflow-hidden rounded-[2px] bg-surface-4" aria-hidden>
              <div className="h-full w-1/3 animate-pulse rounded-[2px] bg-ink" />
            </div>
          </div>
        ) : null}

        {step === 'result' && profile ? (
          <>
            <div className="flex flex-col gap-2">
              <h2 id={titleId} tabIndex={-1} className="m-0 text-[clamp(22px,3vw,26px)] font-semibold leading-tight outline-none">Your priorities</h2>
              {profile.summary ? <p className="m-0 text-[16px] leading-normal [text-wrap:pretty]">{profile.summary}</p> : null}
            </div>
            <ul className="m-0 list-none rounded-card border border-line bg-surface px-4 py-1.5">
              {rows.map(({ a, w }, i) => (
                <li key={a.key} className={cn('flex items-center justify-between gap-3.5 py-3', i > 0 && 'border-t border-line-2')}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{a.label}</span>
                    <span className="text-[13px] leading-snug text-ink-2">{profile.reasons[a.key] || LEVEL_TEXT[w]}</span>
                  </div>
                  <PriorityDots value={w} label={a.label} size="sm" />
                </li>
              ))}
            </ul>
            {profile.watch ? (
              <div className="flex gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3 text-[14px] leading-snug">
                <span aria-hidden className="font-bold text-warn">⚠</span>
                <span><strong>Watch out for:</strong> {profile.watch}</span>
              </div>
            ) : null}
            <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-ink-3">
              {profile.source === 'ai' ? 'Tuned by AI from your answers' : 'Based on your answers'}
            </span>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setStep(0)} className="py-2 text-[15px] underline underline-offset-2">Change answers</button>
              <button type="button" onClick={apply} className="inline-flex min-h-12 items-center rounded-pill bg-accent px-[22px] text-[15px] font-semibold text-on-accent hover:bg-accent-hover">
                Apply to results
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  return mounted ? createPortal(body, document.body) : null;
}

function Mark({ on, multi }: { on: boolean; multi: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-[18px] w-[18px] flex-none items-center justify-center border-[1.5px] text-[11px]',
        multi ? 'rounded-tag' : 'rounded-full',
        on ? 'border-white' : 'border-ink',
      )}
    >
      {on ? (multi ? '✓' : '●') : ''}
    </span>
  );
}

function Footer({ showBack, onBack, onNext, nextLabel, canNext }: { showBack: boolean; onBack: () => void; onNext: () => void; nextLabel: string; canNext: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={onBack} className={cn('py-2 text-[15px] underline underline-offset-2', !showBack && 'invisible')} tabIndex={showBack ? 0 : -1} aria-hidden={!showBack}>
        ← Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="inline-flex min-h-12 items-center rounded-pill bg-accent px-[22px] text-[15px] font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-4 disabled:text-ink-4"
      >
        {nextLabel}
      </button>
    </div>
  );
}

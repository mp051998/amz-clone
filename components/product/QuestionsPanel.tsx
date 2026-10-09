'use client';
import { useEffect, useMemo, useState, useTransition, type FormEvent } from 'react';
import type { Answer, Question, QuestionPage } from '@/lib/data/questions';
import { ANSWER_MAX, QUESTION_MAX, QUESTION_MIN } from '@/lib/data/questions';
import { answerQuestion, askQuestion, loadQuestions, removeAnswer, removeQuestion, toggleAnswerHelpful } from '@/app/actions/questions';
import { Kicker } from '../decision/Badges';
import { useToast } from '../decision/Toast';
import { Button, buttonClasses } from '../primitives/Button';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

export interface QuestionsPanelProps {
  productId: string;
  initial: QuestionPage;
  signedIn: boolean;
  signinHref: string;
  /** false for a product taken off sale: questions stay readable, no new ones */
  canAsk: boolean;
  locale: string;
  timeZone: string;
}

const PAGE = 10;

/** PDP "Customer questions & answers": search, ask, answer, vote answers helpful. */
export function QuestionsPanel({ productId, initial, signedIn, signinHref, canAsk, locale, timeZone }: QuestionsPanelProps) {
  const [items, setItems] = useState<Question[]>(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [asking, setAsking] = useState(false);
  const [ask, setAsk] = useState('');
  const [error, setError] = useState('');
  const [answering, setAnswering] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone }), [locale, timeZone]);
  const num = (n: number) => n.toLocaleString(locale);

  // "Ask a product question" on a delivered order links to #ask-question: open the form there
  useEffect(() => {
    if (!signedIn || !canAsk) return;
    const fromHash = () => {
      if (window.location.hash === '#ask-question') setAsking(true);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [signedIn, canAsk]);
  useEffect(() => {
    if (!asking || window.location.hash !== '#ask-question') return;
    const el = document.getElementById('ask-question');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    document.getElementById('qa-ask')?.focus({ preventScroll: true });
  }, [asking]);

  const patchQuestion = (id: string, fn: (q: Question) => Question) => setItems((qs) => qs.map((q) => (q.id === id ? fn(q) : q)));
  const patchAnswer = (a: Answer, next: Partial<Answer>) =>
    patchQuestion(a.questionId, (q) => ({ ...q, answers: q.answers.map((x) => (x.id === a.id ? { ...x, ...next } : x)) }));

  const search = (q: string) =>
    start(async () => {
      const res = await loadQuestions(productId, q, 0, PAGE);
      if (!res.ok) return toast(res.message);
      setItems(res.items);
      setTotal(res.total);
      setSearched(q);
    });

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    search(query.trim());
  };

  const onMore = () =>
    start(async () => {
      const res = await loadQuestions(productId, searched, items.length, PAGE);
      if (!res.ok) return toast(res.message);
      const seen = new Set(items.map((q) => q.id));
      setItems((qs) => [...qs, ...res.items.filter((q) => !seen.has(q.id))]);
      setTotal(res.total);
    });

  const onAsk = () =>
    start(async () => {
      setError('');
      const res = await askQuestion(productId, ask);
      if (!res.ok) return setError(res.message);
      setItems((qs) => [res.question, ...qs]);
      setTotal((t) => t + 1);
      setAsk('');
      setAsking(false);
      toast('Question posted. Other shoppers can answer it now.');
    });

  const onAnswer = (q: Question) =>
    start(async () => {
      setError('');
      const res = await answerQuestion(productId, q.id, draft);
      if (!res.ok) return setError(res.message);
      patchQuestion(q.id, (x) => ({ ...x, answerCount: x.answerCount + 1, answers: [...x.answers, res.answer] }));
      setExpanded((s) => new Set(s).add(q.id));
      setDraft('');
      setAnswering(null);
    });

  const onHelpful = (a: Answer) =>
    start(async () => {
      const res = await toggleAnswerHelpful(a.id);
      if (!res.ok) return toast(res.message);
      patchAnswer(a, { votedHelpful: res.helpful, helpful: res.helpfulCount });
    });

  const onDeleteQuestion = (q: Question) => {
    if (!window.confirm('Delete your question and its answers?')) return;
    start(async () => {
      const res = await removeQuestion(productId, q.id);
      if (!res.ok) return toast(res.message);
      setItems((qs) => qs.filter((x) => x.id !== q.id));
      setTotal((t) => Math.max(t - 1, 0));
    });
  };

  const onDeleteAnswer = (a: Answer) => {
    if (!window.confirm('Delete your answer?')) return;
    start(async () => {
      const res = await removeAnswer(productId, a.id);
      if (!res.ok) return toast(res.message);
      patchQuestion(a.questionId, (q) => ({ ...q, answerCount: Math.max(q.answerCount - 1, 0), answers: q.answers.filter((x) => x.id !== a.id) }));
    });
  };

  const openAnswer = (id: string) => {
    setError('');
    setDraft('');
    setAnswering(id);
  };

  return (
    <section id="questions" aria-labelledby="qa-h" className="flex max-w-[980px] scroll-mt-[140px] flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="qa-h" className="m-0 text-[22px] font-semibold">Customer questions &amp; answers</h2>
        {canAsk ? (
          signedIn ? (
            <Button variant="secondary" size="sm" onClick={() => { setAsking((v) => !v); setError(''); }} aria-expanded={asking} aria-controls="ask-question">
              Ask a question
            </Button>
          ) : (
            <a href={signinHref} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Sign in to ask a question</a>
          )
        ) : null}
      </div>

      {initial.total > 0 || searched ? (
        <form role="search" onSubmit={onSearch} className="flex max-w-[640px] gap-2">
          <label htmlFor="qa-search" className="sr-only">Search questions and answers</label>
          <input
            id="qa-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
            placeholder="Have a question? Search for answers"
            className={cn(fieldClass, 'flex-1')}
          />
          <Button type="submit" variant="dark" loading={pending && query.trim() !== searched}>Search</Button>
        </form>
      ) : null}

      {asking ? (
        <div id="ask-question" className="flex max-w-[640px] flex-col gap-3 rounded-card border border-line bg-surface p-[18px]">
          <Kicker>Ask other shoppers</Kicker>
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold" htmlFor="qa-ask">
            Your question
            <textarea
              id="qa-ask"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              minLength={QUESTION_MIN}
              maxLength={QUESTION_MAX}
              rows={3}
              placeholder="e.g. Does it fit in carry-on luggage?"
              className={cn(fieldClass, 'h-auto py-2.5 font-normal leading-normal')}
            />
          </label>
          <span className="text-[12px] text-ink-3 tabular-nums">{ask.trim().length}/{QUESTION_MAX} · at least {QUESTION_MIN} characters</span>
          {error && !answering ? <p role="alert" className="m-0 text-[13px] text-bad">⚠ {error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={pending} onClick={onAsk}>Post question</Button>
            <Button variant="secondary" onClick={() => { setAsking(false); setError(''); }}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {searched ? (
        <p className="m-0 text-[14px] text-ink-3">
          <span className="tabular-nums">{num(total)}</span> {total === 1 ? 'question' : 'questions'} matching “{searched}” ·{' '}
          <button type="button" onClick={() => { setQuery(''); search(''); }} className="text-[14px] text-ink underline underline-offset-2">Show all</button>
        </p>
      ) : null}

      {items.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((q) => {
            const open = expanded.has(q.id);
            const shown = open ? q.answers : q.answers.slice(0, 1);
            const answered = q.answers.some((a) => a.mine);
            return (
              <li key={q.id} className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-[18px]">
                <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2">
                  <span className="font-semibold">Q:</span>
                  <div className="flex flex-col gap-1">
                    <p className="m-0 text-[16px] font-semibold leading-snug text-pretty">{q.body}</p>
                    <span className="text-[12px] text-ink-3">
                      {q.mine ? 'You' : q.author} asked on {dateFmt.format(new Date(q.createdAt))}
                    </span>
                  </div>
                </div>

                {shown.length ? (
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {shown.map((a) => (
                      <li key={a.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2">
                        <span className="font-semibold text-ink-2">A:</span>
                        <div className="flex flex-col gap-1.5">
                          <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55] text-ink-2 text-pretty">{a.body}</p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                            <span>{a.mine ? 'You' : a.author}</span>
                            {a.verified ? <span className="rounded-[5px] bg-surface-2 px-[7px] py-[2px] font-semibold text-ink">Bought this</span> : null}
                            <span>· {dateFmt.format(new Date(a.createdAt))}</span>
                            {a.mine ? (
                              <button type="button" disabled={pending} onClick={() => onDeleteAnswer(a)} className="min-h-9 px-1 text-[12px] underline underline-offset-2 hover:text-ink sm:min-h-0">Delete</button>
                            ) : signedIn ? (
                              <button
                                type="button"
                                aria-pressed={a.votedHelpful}
                                disabled={pending}
                                onClick={() => onHelpful(a)}
                                className={cn('min-h-9 rounded-pill border px-2.5 text-[12px] tabular-nums transition-colors sm:min-h-7', a.votedHelpful ? 'border-ink bg-ink text-on-ink' : 'border-line text-ink hover:border-ink')}
                              >
                                {a.votedHelpful ? '✓ Helpful' : 'Helpful'} · {num(a.helpful)}
                              </button>
                            ) : a.helpful ? (
                              <span className="tabular-nums">· {num(a.helpful)} found this helpful</span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 pl-9 text-[14px] text-ink-3">No answers yet.</p>
                )}

                <div className="flex flex-wrap items-center gap-2 pl-9">
                  {q.answers.length > 1 ? (
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setExpanded((s) => { const n = new Set(s); if (open) n.delete(q.id); else n.add(q.id); return n; })}
                      className="min-h-9 text-[13px] text-ink underline underline-offset-2"
                    >
                      {open ? 'Show fewer answers' : `See ${q.answers.length - 1} more ${q.answers.length === 2 ? 'answer' : 'answers'}`}
                    </button>
                  ) : null}
                  {answered ? null : signedIn ? (
                    answering === q.id ? null : (
                      <button type="button" onClick={() => openAnswer(q.id)} className="min-h-9 rounded-pill border border-line px-3 text-[13px] hover:border-ink">
                        Answer this question
                      </button>
                    )
                  ) : (
                    <a href={signinHref} className="inline-flex min-h-9 items-center rounded-pill border border-line px-3 text-[13px] text-ink no-underline hover:border-ink">Sign in to answer</a>
                  )}
                  {q.mine ? (
                    <button type="button" disabled={pending} onClick={() => onDeleteQuestion(q)} className="min-h-9 px-1 text-[13px] text-ink-3 underline underline-offset-2 hover:text-ink">
                      Delete question
                    </button>
                  ) : null}
                </div>

                {answering === q.id ? (
                  <div className="flex flex-col gap-2 pl-9">
                    <label htmlFor={`qa-answer-${q.id}`} className="text-[14px] font-semibold">Your answer</label>
                    <textarea
                      id={`qa-answer-${q.id}`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={ANSWER_MAX}
                      rows={3}
                      placeholder="Share what you know. Answers from shoppers who bought it are marked."
                      className={cn(fieldClass, 'h-auto py-2.5 font-normal leading-normal')}
                    />
                    {error ? <p role="alert" className="m-0 text-[13px] text-bad">⚠ {error}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" size="sm" loading={pending} onClick={() => onAnswer(q)}>Post answer</Button>
                      <Button variant="secondary" size="sm" onClick={() => { setAnswering(null); setError(''); }}>Cancel</Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : searched ? (
        <div className="rounded-card border border-dashed border-line-3 bg-surface p-[22px] text-[15px] text-ink-2">
          No questions or answers mention “{searched}”.{canAsk ? (signedIn ? ' Ask it, and other shoppers can answer.' : ' Sign in to ask it.') : ''}
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-line-3 bg-surface p-[22px] text-[15px] text-ink-2">
          No questions yet.{canAsk ? ' Ask one, and shoppers who own it can answer.' : ''}
        </div>
      )}

      {items.length < total ? (
        <Button variant="secondary" className="self-start" loading={pending} onClick={onMore}>
          See more questions ({num(total - items.length)} more)
        </Button>
      ) : null}
    </section>
  );
}

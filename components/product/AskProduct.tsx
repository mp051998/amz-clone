'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { askAboutProduct } from '@/app/actions/product-ask';
import { ASK_MAX, ASK_MIN, matchParts, readAskQuestion, type AskPassage, type AskResult } from '@/lib/product-ask';
import { Button } from '../primitives/Button';
import { fieldClass } from '../lib/controls';
import { cn } from '../lib/cn';

export interface AskProductProps {
  productId: string;
  /** questions to try with one click */
  suggestions: readonly string[];
}

function source(p: AskPassage): string {
  if (p.kind === 'qa') return 'From customer Q&A';
  if (p.kind === 'review') return p.rating ? `From a ${p.rating}-star review` : 'From a customer review';
  return 'From the product details';
}

function Marked({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {matchParts(text, terms).map((part, i) => (part.hit ? <strong key={i} className="font-semibold text-ink">{part.text}</strong> : <span key={i}>{part.text}</span>))}
    </>
  );
}

/**
 * PDP "Looking for specific info?": ask about the item and get the passages of its details,
 * customer Q&A and reviews that answer it (matched words in bold), with an AI answer on top when
 * the store has one. Nothing found points to asking other shoppers.
 */
export function AskProduct({ productId, suggestions }: AskProductProps) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const ask = (text: string) => {
    const question = readAskQuestion(text);
    if (!question) {
      setError(`Type a question of at least ${ASK_MIN} characters.`);
      return;
    }
    setError('');
    start(async () => {
      const res = await askAboutProduct(productId, question);
      if (res.ok) setResult(res.result);
      else {
        setResult(null);
        setError(res.message);
      }
    });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(query);
  };

  return (
    <section id="ask" aria-labelledby="ask-h" className="flex max-w-[980px] scroll-mt-[140px] flex-col gap-3.5">
      <h2 id="ask-h" className="m-0 text-[22px] font-semibold">Looking for specific info?</h2>
      <form role="search" onSubmit={onSubmit} className="flex max-w-[640px] gap-2">
        <label htmlFor="ask-q" className="sr-only">Ask about this item</label>
        <input
          id="ask-q"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={ASK_MAX}
          placeholder="Search the product details, Q&A and reviews"
          className={cn(fieldClass, 'flex-1')}
        />
        <Button type="submit" variant="dark" loading={pending}>Ask</Button>
      </form>
      {suggestions.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => {
                setQuery(s);
                ask(s);
              }}
              className="min-h-9 rounded-pill border border-line px-3 text-[13px] transition-colors hover:border-ink disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert" className="m-0 text-[13px] text-bad">⚠ {error}</p> : null}

      <div aria-live="polite">
        {result ? (
          <div className="flex max-w-[860px] flex-col gap-3.5 rounded-card border border-line bg-surface p-[18px]">
            {result.answer ? (
              <div className="flex flex-col gap-1">
                <p className="m-0 text-[16px] leading-snug text-pretty">{result.answer}</p>
                <span className="text-[12px] text-ink-3">
                  AI-generated from the product details, customer Q&amp;A and reviews{result.snippets.length ? ' below' : ''}. It can make mistakes.
                </span>
              </div>
            ) : null}
            {result.snippets.length ? (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {result.snippets.map((s, i) => (
                  <li key={i} className="flex flex-col gap-1 border-t border-line-2 pt-3 first:border-t-0 first:pt-0">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{source(s)}</span>
                    {s.kind === 'qa' && s.question ? (
                      <p className="m-0 text-[15px] font-semibold leading-snug">Q: <Marked text={s.question} terms={result.terms} /></p>
                    ) : null}
                    <p className="m-0 text-[15px] leading-relaxed text-ink-2 text-pretty">
                      {s.kind === 'qa' ? 'A: ' : ''}
                      {s.kind === 'review' ? '“' : ''}
                      <Marked text={s.text} terms={result.terms} />
                      {s.kind === 'review' ? '”' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : result.answer ? null : (
              <p className="m-0 text-[15px]">Nothing about “{result.question}” in the product details, customer Q&amp;A or reviews.</p>
            )}
            <p className="m-0 text-[13px] text-ink-3">
              Still not sure?{' '}
              <a href="#questions" className="text-ink underline underline-offset-2">Ask other shoppers</a>
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

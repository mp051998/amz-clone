import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { EmptyState, ProductFrame } from '@/components/decision';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { readUser } from '@/lib/auth';
import { messageFor } from '@/lib/data/errors';
import { listMyAnswers, listMyQuestions } from '@/lib/data/questions';
import { getMarketplace } from '@/lib/marketplace-server';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import type { Product } from '@/lib/types';
import { deleteMyAnswer, deleteMyQuestion } from './actions';

export const metadata: Metadata = { title: 'Your Q&A · Store' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const DONE: Record<string, string> = { question: 'Question deleted, with its answers.', answer: 'Answer deleted.' };

/**
 * /account/questions: the questions the shopper asked and the answers they gave in this store,
 * each linking to the product's Q&A, with Delete.
 */
export default async function YourQuestionsPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const store = await getMarketplace();
  const sp = (path: string) => storePath(store, path);
  const user = await readUser();
  if (!user) redirect(sp('/signin?next=/account/questions'));
  const client = await db();
  const [asked, answered, { done, error }] = await Promise.all([
    listMyQuestions(client, store.id, user.id),
    listMyAnswers(client, store.id, user.id),
    searchParams,
  ]);
  const day = new Intl.DateTimeFormat(store.locale.default, { day: 'numeric', month: 'long', year: 'numeric', timeZone: store.dates.timeZone });
  const productHref = (p: Product) => sp(`/product/${encodeURIComponent(p.id)}`);
  const qaHref = (p: Product) => `${productHref(p)}#questions`;

  const thumb = (p: Product) => (
    <a href={productHref(p)} className="w-[72px] flex-none" tabIndex={-1} aria-hidden>
      <ProductFrame src={p.image} alt="" aspect="1/1" />
    </a>
  );

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[22px] px-[clamp(16px,3vw,24px)] pb-[120px] pt-7">
        <div className="flex flex-col gap-1.5">
          <a href={sp('/account')} className="self-start text-[14px] text-ink underline underline-offset-2">← Account</a>
          <h1 className="m-0 text-[clamp(26px,3.2vw,32px)] font-semibold tracking-[-0.01em]">Your Q&amp;A</h1>
          <span className="text-[15px] text-ink-2">The questions you’ve asked about products, and the answers you’ve given other shoppers.</span>
        </div>

        {done && DONE[done] ? <Alert tone="success">{DONE[done]}</Alert> : null}
        {error ? <Alert tone="error">{messageFor(error) ?? 'Couldn’t delete that. Try again.'}</Alert> : null}

        {!asked.length && !answered.length ? (
          <EmptyState title="No questions or answers yet" action={<a href={sp('/orders')} className={buttonClasses({ variant: 'secondary' })}>Your orders</a>}>
            Ask about a product, or answer another shopper’s question, from the product page. They’ll show up here.
          </EmptyState>
        ) : null}

        {asked.length ? (
          <section aria-labelledby="asked-h" className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="asked-h" className="m-0 text-[20px] font-semibold">Questions you asked</h2>
              <span className="text-[14px] text-ink-3">{plural(asked.length, 'question')}</span>
            </div>
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
              {asked.map(({ question: q, product: p }) => (
                <li key={q.id} className="flex flex-wrap items-start gap-3.5 border-t border-line-2 px-4 py-4 first:border-t-0">
                  {thumb(p)}
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                    <a href={productHref(p)} className="line-clamp-2 text-[14px] text-ink-2 no-underline hover:underline">{p.title}</a>
                    <p className="m-0 text-[15px] font-semibold leading-[1.45]">{q.body}</p>
                    <span className="text-[13px] text-ink-3">
                      Asked {day.format(new Date(q.createdAt))} · {q.answerCount ? plural(q.answerCount, 'answer') : 'No answers yet'}
                    </span>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <a href={qaHref(p)} className="text-[14px] text-ink underline underline-offset-2" aria-label={`See answers: ${q.body}`}>
                        {q.answerCount ? 'See answers' : 'See on product page'}
                      </a>
                      <ConfirmAction
                        action={deleteMyQuestion.bind(null, q.id)}
                        label="Delete"
                        prompt={<>Delete your question about <b>{p.title}</b>?{q.answerCount ? ' Its answers go with it.' : ''}</>}
                        confirmLabel="Delete question"
                        pendingLabel="Deleting…"
                        size="link"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {answered.length ? (
          <section aria-labelledby="answered-h" className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="answered-h" className="m-0 text-[20px] font-semibold">Your answers</h2>
              <span className="text-[14px] text-ink-3">{plural(answered.length, 'answer')}</span>
            </div>
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-surface p-0">
              {answered.map(({ answer: a, question: q, product: p }) => (
                <li key={a.id} className="flex flex-wrap items-start gap-3.5 border-t border-line-2 px-4 py-4 first:border-t-0">
                  {thumb(p)}
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                    <a href={productHref(p)} className="line-clamp-2 text-[14px] text-ink-2 no-underline hover:underline">{p.title}</a>
                    <p className="m-0 text-[14px] text-ink-2"><span className="font-semibold text-ink">Q:</span> {q.body}</p>
                    <p className="m-0 whitespace-pre-line text-[15px] leading-[1.5]"><span className="font-semibold">A:</span> {a.body}</p>
                    <span className="text-[13px] text-ink-3">
                      Answered {day.format(new Date(a.createdAt))}
                      {a.verified ? ' · Verified purchase' : ''}
                      {a.helpful ? ` · ${a.helpful === 1 ? '1 person' : `${a.helpful.toLocaleString('en-US')} people`} found this helpful` : ''}
                    </span>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <a href={qaHref(p)} className="text-[14px] text-ink underline underline-offset-2" aria-label={`See on product page: ${q.body}`}>See on product page</a>
                      <ConfirmAction
                        action={deleteMyAnswer.bind(null, a.id)}
                        label="Delete"
                        prompt={<>Delete your answer about <b>{p.title}</b>?</>}
                        confirmLabel="Delete answer"
                        pendingLabel="Deleting…"
                        size="link"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

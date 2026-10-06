import type { Metadata } from 'next';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { Alert } from '@/components/primitives/Alert';
import { buttonClasses } from '@/components/primitives/Button';
import { EmptyState } from '@/components/decision/Badges';
import { StatusChip } from '@/components/orders/Tracking';
import { listQuestionQueue, questionView, type QuestionQueueView } from '@/lib/data/admin-questions';
import { messageFor } from '@/lib/data/errors';
import { storePath } from '@/lib/marketplace';
import { db } from '@/lib/supabase/server';
import { adminTime } from '../orders/labels';
import { adminPage } from '../guard';
import { AdminFrame, AdminOnly, AdminTabs } from '../ui';
import { deleteQaAction } from './actions';

export const metadata: Metadata = { title: 'Questions · Admin · Store' };

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

const VIEW_LABEL: Record<QuestionQueueView, string> = { unanswered: 'Unanswered', all: 'All' };
const DONE: Record<string, string> = {
  question: 'Question deleted, with its answers.',
  answer: 'Answer deleted.',
};

/**
 * /admin/questions (and /in/admin/questions): shoppers' product questions, unanswered first or
 * all, newest first, with their answers. Admins delete a question (and its answers) or one answer.
 */
export default async function AdminQuestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { store, admin } = await adminPage('/admin/questions');
  if (!admin) return <AdminOnly store={store} />;

  const view = questionView(one(sp, 'view'));
  const page = Math.max(1, Number.parseInt(one(sp, 'page'), 10) || 1);
  const result = await listQuestionQueue(await db(), store.id, { view, page });
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const to = (path: string) => storePath(store, path);
  const listHref = (n: number, v: QuestionQueueView = view) => {
    const out = new URLSearchParams();
    if (v !== 'unanswered') out.set('view', v);
    if (n > 1) out.set('page', String(n));
    const qs = out.toString();
    return to(`/admin/questions${qs ? `?${qs}` : ''}`);
  };
  const error = one(sp, 'error');
  const done = one(sp, 'done');
  const del = (kind: 'question' | 'answer', id: string) => deleteQaAction.bind(null, kind, id, view);
  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <AdminFrame
      store={store}
      path="/admin/questions"
      title="Questions"
      lede={<>What shoppers ask on product pages, and what other shoppers answer. Delete anything off topic or abusive; answers from buyers are marked.</>}
    >
      <AdminTabs
        label="Question views"
        tabs={(['unanswered', 'all'] as const).map((v) => ({ href: listHref(1, v), label: `${VIEW_LABEL[v]} (${n(result.counts[v])})`, current: v === view }))}
      />
      {error ? <Alert tone="error">{messageFor(error) ?? 'Something went wrong. Please try again.'}</Alert> : null}
      {!error && DONE[done] ? <Alert tone="success">{DONE[done]}</Alert> : null}

      {result.questions.length ? (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {result.questions.map((q) => (
            <li key={q.id}>
              <article aria-labelledby={`q-${q.id}`} className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-[18px]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <a href={to(`/product/${encodeURIComponent(q.productId)}#questions`)} className="line-clamp-1 text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink">{q.productTitle}</a>
                    <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                      <span>{q.author}</span>
                      <span aria-hidden>·</span>
                      <span>{adminTime(q.createdAt, store)}</span>
                    </span>
                  </div>
                  {q.answerCount ? (
                    <StatusChip label={`${n(q.answerCount)} ${q.answerCount === 1 ? 'answer' : 'answers'}`} tone="neutral" />
                  ) : (
                    <StatusChip label="Unanswered" tone="warn" />
                  )}
                </div>
                <strong id={`q-${q.id}`} className="text-[17px] font-semibold leading-[1.3]">Q: {q.body}</strong>

                {q.answers.length ? (
                  <ul aria-label="Answers" className="m-0 flex list-none flex-col gap-2.5 border-l-2 border-line-2 p-0 pl-4">
                    {q.answers.map((a) => (
                      <li key={a.id} className="flex flex-col gap-1.5">
                        <p className="m-0 whitespace-pre-line text-[15px] leading-[1.55] text-ink-2">{a.body}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
                            <span>{a.author}</span>
                            {a.verified ? <StatusChip label="Bought this" tone="neutral" /> : null}
                            <span aria-hidden>·</span>
                            <span>{adminTime(a.createdAt, store)}</span>
                            {a.helpful ? <><span aria-hidden>·</span><span>{n(a.helpful)} found helpful</span></> : null}
                          </span>
                          <ConfirmAction
                            action={del('answer', a.id)}
                            label="Delete answer"
                            size="link"
                            prompt={<>Delete this answer?</>}
                            confirmLabel="Yes, delete"
                            pendingLabel="Deleting…"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line-2 pt-3">
                  <ConfirmAction
                    action={del('question', q.id)}
                    label="Delete question"
                    prompt={q.answerCount ? <>Delete this question and its {n(q.answerCount)} {q.answerCount === 1 ? 'answer' : 'answers'}?</> : <>Delete this question?</>}
                    confirmLabel="Yes, delete"
                    pendingLabel="Deleting…"
                  />
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={view === 'unanswered' ? 'Every question has an answer.' : 'No questions yet.'}>
          {view === 'unanswered' ? 'New questions show up here until another shopper answers.' : 'Questions shoppers ask on product pages show up here, newest first.'}
        </EmptyState>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-[14px]">
          {result.page > 1 ? <a href={listHref(result.page - 1)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>← Previous</a> : <span />}
          <span className="text-ink-2">Page {result.page} of {pageCount}</span>
          {result.page < pageCount ? <a href={listHref(result.page + 1)} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>Next →</a> : <span />}
        </nav>
      ) : null}
    </AdminFrame>
  );
}

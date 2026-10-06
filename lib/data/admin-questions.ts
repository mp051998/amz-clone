import type { Db } from '../db/client';
import type { Market } from '../types';
import { DataError, unwrap } from './errors';

/**
 * Q&A moderation for store admins (/admin/questions): a store's questions, unanswered or all,
 * newest first, each with its answers. Deleting goes through delete_question / delete_answer,
 * which let an admin remove anyone's (20261015090000_product_questions.sql).
 */

export type QuestionQueueView = 'unanswered' | 'all';

export const QUESTION_QUEUE_VIEWS: readonly QuestionQueueView[] = ['unanswered', 'all'];
export const QUESTION_QUEUE_PAGE_SIZE = 25;

export function questionView(v: unknown): QuestionQueueView {
  return (QUESTION_QUEUE_VIEWS as readonly unknown[]).includes(v) ? (v as QuestionQueueView) : 'unanswered';
}

export interface QueuedAnswer {
  id: string;
  author: string;
  body: string;
  verified: boolean;
  helpful: number;
  createdAt: string;
}

export interface QueuedQuestion {
  id: string;
  productId: string;
  productTitle: string;
  author: string;
  body: string;
  answerCount: number;
  createdAt: string;
  answers: QueuedAnswer[];
}

export interface QuestionQueuePage {
  questions: QueuedQuestion[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<QuestionQueueView, number>;
}

type Row = Record<string, unknown>;

const STORE_QUESTION = 'id, product_id, author_name, body, answer_count, created_at, products!inner(market_id, title)';

/** One page of a store's questions (unanswered, or all), newest first, with both views' counts. */
export async function listQuestionQueue(
  db: Db,
  market: Market,
  opts: { view?: QuestionQueueView; page?: number } = {},
): Promise<QuestionQueuePage> {
  const view = opts.view ?? 'unanswered';
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const from = (page - 1) * QUESTION_QUEUE_PAGE_SIZE;
  const count = (unansweredOnly: boolean) => {
    const q = db.from('product_questions').select('id, products!inner(market_id)', { count: 'exact', head: true }).eq('products.market_id', market);
    return unansweredOnly ? q.eq('answer_count', 0) : q;
  };
  let list = db.from('product_questions').select(STORE_QUESTION, { count: 'exact' }).eq('products.market_id', market);
  if (view === 'unanswered') list = list.eq('answer_count', 0);

  const [res, all, unanswered] = await Promise.all([
    list.order('created_at', { ascending: false }).order('id').range(from, from + QUESTION_QUEUE_PAGE_SIZE - 1),
    count(false),
    count(true),
  ]);
  const rows = (unwrap(res) ?? []) as unknown as Row[];

  const byQuestion = new Map<string, QueuedAnswer[]>();
  if (rows.length) {
    const answers = unwrap(
      await db
        .from('product_answers')
        .select('id, question_id, author_name, body, verified, helpful_count, created_at')
        .in('question_id', rows.map((r) => String(r.id)))
        .order('created_at')
        .order('id'),
    ) as unknown as Row[];
    for (const a of answers) {
      const list = byQuestion.get(String(a.question_id)) ?? [];
      list.push({
        id: String(a.id),
        author: String(a.author_name ?? ''),
        body: String(a.body ?? ''),
        verified: a.verified === true,
        helpful: Number(a.helpful_count ?? 0),
        createdAt: String(a.created_at),
      });
      byQuestion.set(String(a.question_id), list);
    }
  }

  return {
    questions: rows.map((r) => ({
      id: String(r.id),
      productId: String(r.product_id),
      productTitle: String((r.products as Row | null)?.title ?? ''),
      author: String(r.author_name ?? ''),
      body: String(r.body ?? ''),
      answerCount: Number(r.answer_count ?? 0),
      createdAt: String(r.created_at),
      answers: byQuestion.get(String(r.id)) ?? [],
    })),
    total: res.count ?? rows.length,
    page,
    pageSize: QUESTION_QUEUE_PAGE_SIZE,
    counts: { all: all.count ?? 0, unanswered: unanswered.count ?? 0 },
  };
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Whether a question is about a product of `market` (admin pages are per store). */
export async function assertStoreQuestion(db: Db, market: Market, id: string): Promise<void> {
  if (!UUID.test(id)) throw new DataError('question_not_found');
  const row = unwrap(
    await db.from('product_questions').select('id, products!inner(market_id)').eq('id', id).eq('products.market_id', market).maybeSingle(),
  );
  if (!row) throw new DataError('question_not_found');
}

/** Whether an answer is on a question about a product of `market`. */
export async function assertStoreAnswer(db: Db, market: Market, id: string): Promise<void> {
  if (!UUID.test(id)) throw new DataError('answer_not_found');
  const row = unwrap(
    await db
      .from('product_answers')
      .select('id, product_questions!inner(products!inner(market_id))')
      .eq('id', id)
      .eq('product_questions.products.market_id', market)
      .maybeSingle(),
  );
  if (!row) throw new DataError('answer_not_found');
}

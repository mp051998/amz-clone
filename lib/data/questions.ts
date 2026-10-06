import type { PostgrestError } from '@supabase/supabase-js';
import type { Db } from '../db/client';
import type { Market, Product } from '../types';
import { getProducts } from './catalog';
import { DataError, fromPostgrest, unwrap } from './errors';

/**
 * Customer questions & answers on a product page. Reads are public; asking,
 * answering, deleting and helpful votes go through the database functions, which
 * set the author, the "verified" mark (the answerer bought it) and the counters.
 */

export const QUESTION_MIN = 10;
export const QUESTION_MAX = 300;
export const ANSWER_MIN = 2;
export const ANSWER_MAX = 1000;

export interface Answer {
  id: string;
  questionId: string;
  body: string;
  author: string;
  createdAt: string;
  /** the answerer has a placed order containing the product */
  verified: boolean;
  helpful: number;
  /** viewer state */
  mine: boolean;
  votedHelpful: boolean;
}

export interface Question {
  id: string;
  productId: string;
  body: string;
  author: string;
  createdAt: string;
  answerCount: number;
  mine: boolean;
  /** most helpful first, then oldest */
  answers: Answer[];
}

export interface QuestionPage {
  items: Question[];
  total: number;
}

interface QuestionRow {
  id: string;
  product_id: string;
  user_id: string | null;
  author_name: string;
  body: string;
  answer_count: number;
  created_at: string;
}

interface AnswerRow {
  id: string;
  question_id: string;
  user_id: string | null;
  author_name: string;
  body: string;
  verified: boolean;
  helpful_count: number;
  created_at: string;
}

export function toQuestion(row: QuestionRow, viewerId: string | null, answers: Answer[] = []): Question {
  return {
    id: row.id,
    productId: row.product_id,
    body: row.body,
    author: row.author_name,
    createdAt: row.created_at,
    answerCount: row.answer_count,
    mine: viewerId != null && row.user_id === viewerId,
    answers,
  };
}

export function toAnswer(row: AnswerRow, viewerId: string | null, voted: ReadonlySet<string> = new Set()): Answer {
  return {
    id: row.id,
    questionId: row.question_id,
    body: row.body,
    author: row.author_name,
    createdAt: row.created_at,
    verified: row.verified,
    helpful: row.helpful_count,
    mine: viewerId != null && row.user_id === viewerId,
    votedHelpful: voted.has(row.id),
  };
}

/** `q` as an ilike pattern that matches it literally anywhere. */
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const Q_COLS = 'id, product_id, user_id, author_name, body, answer_count, created_at';
const A_COLS = 'id, question_id, user_id, author_name, body, verified, helpful_count, created_at';

/**
 * A product's questions, most answered first, then newest, each with all its answers. `q`
 * keeps questions whose text, or one of whose answers, contains it. Empty before the migration.
 */
export async function listQuestions(
  db: Db,
  productId: string,
  viewerId: string | null,
  opts: { q?: string; limit?: number; offset?: number } = {},
): Promise<QuestionPage> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.q?.trim().slice(0, 100) ?? '';

  let query = db.from('product_questions').select(Q_COLS, { count: 'exact' }).eq('product_id', productId);
  if (q) {
    const ids = await matchingQuestionIds(db, productId, q);
    if (ids === null) return { items: [], total: 0 };
    query = query.in('id', ids);
  }
  const res = await query
    .order('answer_count', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id')
    .range(offset, offset + limit - 1);
  if (res.error) {
    // before the migration
    if (res.error.code === '42P01' || res.error.code === 'PGRST205') return { items: [], total: 0 };
    throw new DataError('internal', res.error.message, 'Questions couldn’t be loaded.');
  }
  const rows = res.data as QuestionRow[];
  if (!rows.length) return { items: [], total: res.count ?? 0 };

  const ids = rows.map((r) => r.id);
  const answers = unwrap(
    await db
      .from('product_answers')
      .select(A_COLS)
      .in('question_id', ids)
      .order('helpful_count', { ascending: false })
      .order('created_at')
      .order('id'),
  ) as AnswerRow[];
  const voted = new Set<string>();
  if (viewerId && answers.length) {
    const votes = await db.from('answer_votes').select('answer_id').in('answer_id', answers.map((a) => a.id));
    for (const v of votes.data ?? []) voted.add(v.answer_id);
  }
  const byQuestion = new Map<string, Answer[]>();
  for (const a of answers) {
    const list = byQuestion.get(a.question_id) ?? [];
    list.push(toAnswer(a, viewerId, voted));
    byQuestion.set(a.question_id, list);
  }
  return { items: rows.map((r) => toQuestion(r, viewerId, byQuestion.get(r.id))), total: res.count ?? rows.length };
}

/** How many of a product's questions have at least one answer (0 on any error: it's a link label). */
export async function countAnsweredQuestions(db: Db, productId: string): Promise<number> {
  const res = await db
    .from('product_questions')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .gt('answer_count', 0);
  return res.error ? 0 : (res.count ?? 0);
}

/**
 * Ids of a product's questions whose text, or one of whose answers, contains `q` (so a search
 * finds what was said in reply). Null when the tables aren't there yet.
 */
async function matchingQuestionIds(db: Db, productId: string, q: string): Promise<string[] | null> {
  const pattern = containsPattern(q);
  const all = await db.from('product_questions').select('id, body').eq('product_id', productId).limit(1000);
  if (all.error) return null;
  const needle = q.toLowerCase();
  const ids = new Set(all.data.filter((r) => r.body.toLowerCase().includes(needle)).map((r) => r.id));
  const rest = all.data.map((r) => r.id).filter((id) => !ids.has(id));
  if (rest.length) {
    const hits = await db.from('product_answers').select('question_id').in('question_id', rest).ilike('body', pattern);
    for (const h of hits.data ?? []) ids.add(h.question_id);
  }
  return [...ids];
}

function checkLength(body: string, min: number, max: number, what: string): string {
  const text = body.trim();
  if (text.length < min) throw new DataError('invalid_input', 'body', `Write at least ${min} characters for your ${what}.`);
  if (text.length > max) throw new DataError('invalid_input', 'body', `Keep your ${what} under ${max} characters.`);
  return text;
}

/** A write's row, with `duplicate` reworded for what was written twice. */
function written(res: { data: unknown; error: PostgrestError | null }, duplicate: string): unknown {
  if (!res.error) return res.data;
  const err = fromPostgrest(res.error);
  throw err.code === 'duplicate' ? new DataError('duplicate', err.detail, duplicate) : err;
}

/** Ask a question about a product (signed in). */
export async function askQuestion(db: Db, productId: string, viewerId: string, body: string): Promise<Question> {
  const text = checkLength(body, QUESTION_MIN, QUESTION_MAX, 'question');
  const res = await db.rpc('ask_question', { p_product: productId, p_body: text });
  const row = written(res, 'You’ve already asked that question.') as QuestionRow;
  return toQuestion(row, viewerId);
}

/** Answer a question (signed in; one answer per shopper per question). */
export async function answerQuestion(db: Db, questionId: string, viewerId: string, body: string): Promise<Answer> {
  const text = checkLength(body, ANSWER_MIN, ANSWER_MAX, 'answer');
  const res = await db.rpc('answer_question', { p_question: questionId, p_body: text });
  const row = written(res, 'You’ve already answered this question.') as AnswerRow;
  return toAnswer(row, viewerId);
}

/** One of the caller's questions, with its product. */
export interface MyQuestion {
  question: Question;
  product: Product;
}

/** One of the caller's answers, with the question it answers and that question's product. */
export interface MyAnswer {
  answer: Answer;
  question: { id: string; body: string };
  product: Product;
}

const productsById = async (db: Db, ids: string[]) =>
  new Map((await getProducts(db, [...new Set(ids)], { includeArchived: true })).map((p) => [p.id, p]));

/** The questions the caller asked in this store, newest first (up to 100). */
export async function listMyQuestions(db: Db, market: Market, userId: string): Promise<MyQuestion[]> {
  const rows = unwrap(
    await db
      .from('product_questions')
      .select(`${Q_COLS}, products!inner(market_id)`)
      .eq('user_id', userId)
      .eq('products.market_id', market)
      .order('created_at', { ascending: false })
      .limit(100),
  ) as unknown as QuestionRow[];
  const products = await productsById(db, rows.map((r) => r.product_id));
  return rows.flatMap((r) => {
    const product = products.get(r.product_id);
    return product ? [{ question: toQuestion(r, userId), product }] : [];
  });
}

/** The answers the caller gave in this store, newest first (up to 100). */
export async function listMyAnswers(db: Db, market: Market, userId: string): Promise<MyAnswer[]> {
  const rows = unwrap(
    await db
      .from('product_answers')
      .select(`${A_COLS}, product_questions!inner(id, body, product_id, products!inner(market_id))`)
      .eq('user_id', userId)
      .eq('product_questions.products.market_id', market)
      .order('created_at', { ascending: false })
      .limit(100),
  ) as unknown as (AnswerRow & { product_questions: { id: string; body: string; product_id: string } })[];
  const products = await productsById(db, rows.map((r) => r.product_questions.product_id));
  return rows.flatMap((r) => {
    const product = products.get(r.product_questions.product_id);
    const { id, body } = r.product_questions;
    return product ? [{ answer: toAnswer(r, userId), question: { id, body }, product }] : [];
  });
}

export async function deleteQuestion(db: Db, questionId: string): Promise<void> {
  unwrap(await db.rpc('delete_question', { p_question: questionId }));
}

export async function deleteAnswer(db: Db, answerId: string): Promise<void> {
  unwrap(await db.rpc('delete_answer', { p_answer: answerId }));
}

export interface AnswerHelpfulState {
  answerId: string;
  helpful: boolean;
  helpfulCount: number;
}

/** Toggle the caller's helpful vote on someone else's answer. */
export async function toggleAnswerHelpful(db: Db, answerId: string): Promise<AnswerHelpfulState> {
  const r = unwrap(await db.rpc('toggle_answer_helpful', { p_answer: answerId })) as {
    answer_id: string;
    helpful: boolean;
    helpful_count: number;
  };
  return { answerId: r.answer_id, helpful: r.helpful, helpfulCount: r.helpful_count };
}

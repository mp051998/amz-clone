import 'server-only';
import type { Db } from '../db/client';
import type { Market } from '../types';
import { answerProductQuestion } from '../ai/features/ask';
import type { FeatureOptions } from '../ai';
import { askTerms, productPassages, rankPassages, readAskQuestion, ASK_MAX, ASK_MIN, type AskResult } from '../product-ask';
import { getProduct, getProductInfo } from './catalog';
import { DataError, unwrap } from './errors';
import { listQuestions } from './questions';

/** reviews searched: the most helpful */
const REVIEWS = 300;
/** passages the AI answer is written from, besides the product details */
const AI_NOTES = 10;
const AI_DETAILS = 25;

/**
 * "Looking for specific info?": a question about a product in this store answered from its details,
 * customer Q&A and reviews (lib/product-ask.ts), with an AI answer on top when a provider is set.
 */
export async function askProduct(db: Db, market: Market, productId: string, question: unknown, opts: FeatureOptions = {}): Promise<AskResult> {
  const q = readAskQuestion(question);
  if (!q) throw new DataError('invalid_input', 'question', `Ask a question of ${ASK_MIN} to ${ASK_MAX} characters.`);
  const p = await getProduct(db, productId, { includeArchived: true });
  if (!p || p.market !== market) throw new DataError('product_not_found');

  const [info, questions, reviews] = await Promise.all([
    getProductInfo(db, p.id),
    listQuestions(db, p.id, null, { limit: 50 }),
    db
      .from('reviews')
      .select('rating, title, body')
      .eq('product_id', p.id)
      .neq('body', '')
      .is('hidden_at', null)
      .order('helpful_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(REVIEWS)
      .then((res) => (unwrap(res) ?? []) as unknown as { rating: number; title: string; body: string }[]),
  ]);
  const passages = productPassages({
    bullets: p.bullets,
    details: info.details,
    description: info.description,
    questions: questions.items.filter((x) => x.answers.length),
    reviews,
  });
  const terms = askTerms(q);
  const snippets = rankPassages(terms, passages);
  // the model sees all the details (they may answer it in other words) and the best of the rest
  const notes = [
    ...passages.filter((x) => x.kind === 'details').slice(0, AI_DETAILS),
    ...rankPassages(terms, passages.filter((x) => x.kind !== 'details'), { limit: AI_NOTES, perKind: AI_NOTES }),
  ];
  const answer = await answerProductQuestion(p, q, notes, opts);
  // which review or question a passage came from is only for ranking
  return { question: q, answer, snippets: snippets.map(({ group: _, ...s }) => s), terms, source: answer ? 'ai' : 'rules' };
}

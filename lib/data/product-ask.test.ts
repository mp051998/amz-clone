import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getProductInfo: vi.fn(),
  listQuestions: vi.fn(),
  answerProductQuestion: vi.fn(),
}));
vi.mock('./catalog', () => ({ getProduct: mocks.getProduct, getProductInfo: mocks.getProductInfo }));
vi.mock('./questions', () => ({ listQuestions: mocks.listQuestions }));
vi.mock('../ai/features/ask', () => ({ answerProductQuestion: mocks.answerProductQuestion }));

import type { Db } from '../db/client';
import { DataError } from './errors';
import { askProduct } from './product-ask';

const reviews = [
  { rating: 5, title: 'Battery for days', body: 'I charge them once a week.' },
  { rating: 3, title: 'Tight', body: 'They squeeze a bit.' },
];

/** A db whose reviews query records its calls and resolves to `reviews`. */
function fakeDb() {
  const calls: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return chain;
    };
  }
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: reviews, error: null }).then(ok);
  const db = { from: (t: string) => (calls.push(['from', [t]]), chain) } as unknown as Db;
  return { db, calls };
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getProduct.mockResolvedValue({ id: 'p1', market: 'US', title: 'Quiet Headphones', bullets: ['Up to 30 hours of battery life'] });
  mocks.getProductInfo.mockResolvedValue({ description: 'Folds flat.', details: [['Weight', '250 g']], gallery: [], variants: null, firstAvailable: null });
  mocks.listQuestions.mockResolvedValue({
    total: 2,
    items: [
      { id: 'q1', body: 'Does the battery last?', answers: [{ body: 'About 26 hours.' }] },
      { id: 'q2', body: 'Is the battery replaceable?', answers: [] },
    ],
  });
  mocks.answerProductQuestion.mockResolvedValue(null);
});

describe('askProduct', () => {
  it('ranks details, answered Q&A and the most helpful visible reviews', async () => {
    const { db, calls } = fakeDb();
    const r = await askProduct(db, 'US', 'p1', '  How long does the  battery last? ');
    expect(r).toMatchObject({ question: 'How long does the battery last?', answer: null, source: 'rules', terms: ['battery', 'last'] });
    expect(r.snippets.map((s) => [s.kind, s.text])).toEqual([
      ['qa', 'About 26 hours.'],
      ['details', 'Up to 30 hours of battery life'],
      ['review', 'Battery for days'],
    ]);
    expect(r.snippets.every((s) => !('group' in s))).toBe(true);
    expect(mocks.getProduct).toHaveBeenCalledWith(db, 'p1', { includeArchived: true });
    expect(mocks.listQuestions).toHaveBeenCalledWith(db, 'p1', null, { limit: 50 });
    expect(calls).toEqual(expect.arrayContaining([['from', ['reviews']], ['eq', ['product_id', 'p1']], ['is', ['hidden_at', null]], ['order', ['helpful_count', { ascending: false }]], ['limit', [300]]]));
  });

  it('gives the AI every detail plus the best Q&A and reviews, and reports its answer', async () => {
    mocks.answerProductQuestion.mockResolvedValue('Up to 30 hours.');
    const r = await askProduct(fakeDb().db, 'US', 'p1', 'battery');
    expect(r).toMatchObject({ answer: 'Up to 30 hours.', source: 'ai' });
    const [product, q, notes] = mocks.answerProductQuestion.mock.calls[0];
    expect(product).toMatchObject({ id: 'p1' });
    expect(q).toBe('battery');
    expect(notes.map((n: { kind: string; text: string }) => n.text)).toEqual([
      'Up to 30 hours of battery life',
      'Weight: 250 g',
      'Folds flat.',
      'About 26 hours.',
      'Battery for days',
    ]);
  });

  it('refuses bad questions and products from another store', async () => {
    await expect(askProduct(fakeDb().db, 'US', 'p1', 'ok')).rejects.toMatchObject({ code: 'invalid_input', detail: 'question' });
    await expect(askProduct(fakeDb().db, 'IN', 'p1', 'battery')).rejects.toBeInstanceOf(DataError);
    mocks.getProduct.mockResolvedValue(null);
    await expect(askProduct(fakeDb().db, 'US', 'p1', 'battery')).rejects.toMatchObject({ code: 'product_not_found' });
  });
});

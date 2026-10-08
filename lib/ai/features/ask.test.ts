import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { setProviderOverride } from '../index';
import { createMockProvider } from '../providers/mock';
import type { AskPassage } from '../../product-ask';
import { answerProductQuestion } from './ask';

const off = { cache: false } as const;
const product = { id: 'p1', title: 'Quiet Headphones' };
const notes: AskPassage[] = [
  { kind: 'details', text: 'Up to 30 hours of battery life' },
  { kind: 'qa', text: 'Closer to 26 with noise cancelling on.', question: 'Does the battery last 30 hours?' },
  { kind: 'review', text: 'I charge them once a week.', rating: 5 },
];

afterEach(() => {
  setProviderOverride(undefined);
  vi.restoreAllMocks();
});

describe('answerProductQuestion', () => {
  it('answers from the numbered notes, tagged by source', async () => {
    const p = createMockProvider([JSON.stringify({ answerable: true, answer: '  Up to 30 hours;  reviewers say about 26 with noise cancelling. ' })]);
    const answer = await answerProductQuestion(product, 'How long does the battery last?', notes, { provider: p, ...off });
    expect(answer).toBe('Up to 30 hours; reviewers say about 26 with noise cancelling.');
    const sent = p.calls[0].prompt;
    expect(sent).toContain('"How long does the battery last?"');
    expect(sent).toContain('1. [D] Up to 30 hours of battery life');
    expect(sent).toContain('2. [Q] Q: Does the battery last 30 hours? A: Closer to 26 with noise cancelling on.');
    expect(sent).toContain('3. [R 5★] I charge them once a week.');
    expect(p.calls[0].json).toBe(true);
  });

  it('is null when the notes don’t answer it', async () => {
    const p = createMockProvider([JSON.stringify({ answerable: false, answer: '' })]);
    expect(await answerProductQuestion(product, 'Is it waterproof?', notes, { provider: p, ...off })).toBeNull();
    const q = createMockProvider([JSON.stringify({ answerable: true, answer: '   ' })]);
    expect(await answerProductQuestion(product, 'Is it waterproof?', notes, { provider: q, ...off })).toBeNull();
  });

  it('is null without a provider or notes, and on bad replies', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await answerProductQuestion(product, 'battery?', notes, { provider: null })).toBeNull();
    const p = createMockProvider(['not json']);
    expect(await answerProductQuestion(product, 'battery?', [], { provider: p, ...off })).toBeNull();
    expect(p.calls).toHaveLength(0);
    expect(await answerProductQuestion(product, 'battery?', notes, { provider: p, ...off })).toBeNull();
  });
});

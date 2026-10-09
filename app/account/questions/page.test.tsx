import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import type { Answer, Question } from '@/lib/data/questions';
import { product } from '@/test/fixtures/decision';

const state = vi.hoisted(() => ({
  store: null as unknown,
  user: { id: 'u1', name: 'Asha', email: 'asha@example.com' } as unknown,
  asked: [] as unknown[],
  answered: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/lib/marketplace-server', () => ({ getMarketplace: async () => state.store }));
vi.mock('@/lib/auth', () => ({ readUser: async () => state.user }));
vi.mock('@/lib/supabase/server', () => ({ db: async () => ({}) }));
vi.mock('@/lib/data/questions', () => ({
  listMyQuestions: async () => state.asked,
  listMyAnswers: async () => state.answered,
}));
vi.mock('./actions', () => ({ deleteMyQuestion: async () => {}, deleteMyAnswer: async () => {} }));

import YourQuestionsPage from './page';

const question = (over: Partial<Question> = {}): Question => ({
  id: 'q1',
  productId: 'k 1',
  body: 'Does the lid lock when tipped?',
  author: 'Asha',
  createdAt: '2026-10-02T12:00:00Z',
  answerCount: 2,
  mine: true,
  answers: [],
  ...over,
});

const answer = (over: Partial<Answer> = {}): Answer => ({
  id: 'a1',
  questionId: 'q9',
  body: 'Yes, it clicks shut.',
  author: 'Asha',
  createdAt: '2026-10-03T12:00:00Z',
  verified: true,
  helpful: 3,
  mine: true,
  votedHelpful: false,
  reported: false,
  ...over,
});

const show = async (sp: { done?: string; error?: string } = {}) => render(await YourQuestionsPage({ searchParams: Promise.resolve(sp) }));

afterEach(cleanup);
beforeEach(() => {
  state.store = amazon;
  state.user = { id: 'u1', name: 'Asha', email: 'asha@example.com' };
  state.asked = [];
  state.answered = [];
});

it('sends the signed-out to sign in (India store paths too)', async () => {
  state.user = null;
  await expect(YourQuestionsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT /signin?next=/account/questions');
  state.store = amazonIn;
  await expect(YourQuestionsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT /in/signin?next=/account/questions');
});

it('says when there is nothing yet', async () => {
  await show();
  expect(screen.getByText('No questions or answers yet')).toBeInTheDocument();
});

it('lists the questions asked, linking to their answers', async () => {
  state.asked = [
    { question: question(), product: product({ id: 'k 1', title: 'Travel Kettle' }) },
    { question: question({ id: 'q2', body: 'Is the cable long enough?', answerCount: 0 }), product: product({ id: 'k2', title: 'Desk Lamp' }) },
  ];
  await show();
  const section = screen.getByRole('region', { name: 'Questions you asked' });
  expect(within(section).getByText('2 questions')).toBeInTheDocument();
  expect(within(section).getByText('Does the lid lock when tipped?')).toBeInTheDocument();
  expect(within(section).getByText('Asked October 2, 2026 · 2 answers')).toBeInTheDocument();
  expect(within(section).getByRole('link', { name: 'See answers: Does the lid lock when tipped?' })).toHaveAttribute('href', '/product/k%201#questions');
  expect(within(section).getByText('Asked October 2, 2026 · No answers yet')).toBeInTheDocument();
  expect(within(section).getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  expect(screen.queryByRole('region', { name: 'Your answers' })).toBeNull();
});

it('lists the answers given, with the question each one answers', async () => {
  state.store = amazonIn;
  state.answered = [{ answer: answer(), question: { id: 'q9', body: 'Does it fold flat?' }, product: product({ id: 'b1', title: 'Camping Chair' }) }];
  await show();
  const section = screen.getByRole('region', { name: 'Your answers' });
  expect(within(section).getByText('1 answer')).toBeInTheDocument();
  expect(within(section).getByText('Does it fold flat?')).toBeInTheDocument();
  expect(within(section).getByText('Yes, it clicks shut.')).toBeInTheDocument();
  expect(within(section).getByText(/Verified purchase · 3 people found this helpful/)).toBeInTheDocument();
  expect(within(section).getByRole('link', { name: 'See on product page: Does it fold flat?' })).toHaveAttribute('href', '/in/product/b1#questions');
});

it('confirms a delete, and shows why one failed', async () => {
  await show({ done: 'question' });
  expect(screen.getByText('Question deleted, with its answers.')).toBeInTheDocument();
  cleanup();
  await show({ done: 'answer' });
  expect(screen.getByText('Answer deleted.')).toBeInTheDocument();
  cleanup();
  await show({ error: 'something_odd' });
  expect(screen.getByText('Couldn’t delete that. Try again.')).toBeInTheDocument();
});

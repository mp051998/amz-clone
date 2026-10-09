import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Answer, Question } from '@/lib/data/questions';

const actions = vi.hoisted(() => ({
  askQuestion: vi.fn(),
  answerQuestion: vi.fn(),
  removeQuestion: vi.fn(),
  removeAnswer: vi.fn(),
  toggleAnswerHelpful: vi.fn(),
  loadQuestions: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions/questions', () => actions);
vi.mock('../decision/Toast', () => ({ useToast: () => ({ toast }) }));

import { QuestionsPanel, type QuestionsPanelProps } from './QuestionsPanel';

afterEach(cleanup);
beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  toast.mockReset();
});

const answer = (id: string, over: Partial<Answer> = {}): Answer => ({
  id, questionId: 'q1', body: `Answer ${id}`, author: 'Lee', createdAt: '2026-10-02T00:00:00Z', verified: false, helpful: 0, mine: false, votedHelpful: false, ...over,
});
const question = (id: string, over: Partial<Question> = {}): Question => ({
  id, productId: 'p1', body: `Does ${id} fit a carry-on?`, author: 'Sam', createdAt: '2026-10-01T00:00:00Z', answerCount: 0, mine: false, answers: [], ...over,
});

const props = (over: Partial<QuestionsPanelProps> = {}): QuestionsPanelProps => ({
  productId: 'p1', initial: { items: [], total: 0 }, signedIn: true, signinHref: '/signin?next=x', canAsk: true, locale: 'en-US', timeZone: 'UTC', ...over,
});

it('signed out, asks shoppers to sign in to ask or answer', () => {
  render(<QuestionsPanel {...props({ signedIn: false, initial: { items: [question('q1')], total: 1 } })} />);
  expect(screen.getByRole('link', { name: 'Sign in to ask a question' })).toHaveAttribute('href', '/signin?next=x');
  expect(screen.getByRole('link', { name: 'Sign in to answer' })).toBeInTheDocument();
  expect(screen.getByText('No answers yet.')).toBeInTheDocument();
});

it('shows the top answer, a verified mark and the rest on request', () => {
  const q = question('q1', { answerCount: 3, answers: [answer('a1', { verified: true, helpful: 4 }), answer('a2'), answer('a3')] });
  render(<QuestionsPanel {...props({ signedIn: false, initial: { items: [q], total: 1 } })} />);
  expect(screen.getByText('Answer a1')).toBeInTheDocument();
  expect(screen.getByText('Bought this')).toBeInTheDocument();
  expect(screen.getByText('· 4 found this helpful')).toBeInTheDocument();
  expect(screen.queryByText('Answer a2')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'See 2 more answers' }));
  expect(screen.getByText('Answer a3')).toBeInTheDocument();
});

it('opens the question form when linked to #ask-question', () => {
  window.history.replaceState(null, '', '#ask-question');
  try {
    render(<QuestionsPanel {...props()} />);
    expect(screen.getByRole('button', { name: 'Ask a question' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Your question')).toHaveFocus();
    cleanup();
    // signed out, or off sale, there's no form to open
    render(<QuestionsPanel {...props({ canAsk: false })} />);
    expect(screen.queryByLabelText('Your question')).toBeNull();
  } finally {
    window.history.replaceState(null, '', '#');
  }
});

it('posts a question to the top of the list', async () => {
  actions.askQuestion.mockResolvedValue({ ok: true, question: question('new', { body: 'Is it loud at night?', mine: true }) });
  render(<QuestionsPanel {...props()} />);
  expect(screen.getByText(/No questions yet/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ask a question' }));
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Is it loud at night?' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Post question' }));
  });
  expect(actions.askQuestion).toHaveBeenCalledWith('p1', 'Is it loud at night?');
  expect(screen.getByText('Is it loud at night?')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete question' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Your question')).not.toBeInTheDocument();
});

it('keeps the form open with the reason when a question is rejected', async () => {
  actions.askQuestion.mockResolvedValue({ ok: false, code: 'invalid_input', message: 'Write at least 10 characters for your question.' });
  render(<QuestionsPanel {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask a question' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Post question' }));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Write at least 10 characters');
  expect(screen.getByLabelText('Your question')).toBeInTheDocument();
});

it('answers a question once', async () => {
  actions.answerQuestion.mockResolvedValue({ ok: true, answer: answer('mine', { body: 'Yes, easily.', mine: true }) });
  render(<QuestionsPanel {...props({ initial: { items: [question('q1')], total: 1 } })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Answer this question' }));
  fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Yes, easily.' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Post answer' }));
  });
  expect(actions.answerQuestion).toHaveBeenCalledWith('p1', 'q1', 'Yes, easily.');
  expect(screen.getByText('Yes, easily.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Answer this question' })).not.toBeInTheDocument();
});

it('toggles a helpful vote on someone else’s answer', async () => {
  actions.toggleAnswerHelpful.mockResolvedValue({ ok: true, answerId: 'a1', helpful: true, helpfulCount: 3 });
  const q = question('q1', { answerCount: 1, answers: [answer('a1', { helpful: 2 })] });
  render(<QuestionsPanel {...props({ initial: { items: [q], total: 1 } })} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Helpful · 2' }));
  });
  expect(actions.toggleAnswerHelpful).toHaveBeenCalledWith('a1');
  expect(screen.getByRole('button', { name: '✓ Helpful · 3' })).toHaveAttribute('aria-pressed', 'true');
});

it('searches and goes back to all questions', async () => {
  const initial = { items: [question('q1'), question('q2')], total: 2 };
  actions.loadQuestions.mockResolvedValueOnce({ ok: true, items: [question('q2')], total: 1 });
  render(<QuestionsPanel {...props({ initial })} />);
  fireEvent.change(screen.getByLabelText('Search questions and answers'), { target: { value: 'red' } });
  await act(async () => {
    fireEvent.submit(screen.getByRole('search'));
  });
  expect(actions.loadQuestions).toHaveBeenCalledWith('p1', 'red', 0, 10);
  expect(screen.getByText(/matching “red”/)).toBeInTheDocument();
  expect(screen.queryByText('Does q1 fit a carry-on?')).not.toBeInTheDocument();

  actions.loadQuestions.mockResolvedValueOnce({ ok: true, ...initial });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  });
  expect(actions.loadQuestions).toHaveBeenLastCalledWith('p1', '', 0, 10);
  expect(screen.getByText('Does q1 fit a carry-on?')).toBeInTheDocument();
});

it('loads more questions without repeating any', async () => {
  actions.loadQuestions.mockResolvedValue({ ok: true, items: [question('q2'), question('q3')], total: 3 });
  render(<QuestionsPanel {...props({ initial: { items: [question('q1'), question('q2')], total: 3 } })} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'See more questions (1 more)' }));
  });
  expect(actions.loadQuestions).toHaveBeenCalledWith('p1', '', 2, 10);
  const list = screen.getAllByRole('list')[0];
  expect(within(list).getAllByText(/fit a carry-on/)).toHaveLength(3);
  expect(screen.queryByRole('button', { name: /See more questions/ })).not.toBeInTheDocument();
});

it('a product off sale keeps its questions but takes no new ones', () => {
  render(<QuestionsPanel {...props({ canAsk: false, initial: { items: [question('q1')], total: 1 } })} />);
  expect(screen.queryByRole('button', { name: 'Ask a question' })).not.toBeInTheDocument();
  expect(screen.getByText('Does q1 fit a carry-on?')).toBeInTheDocument();
});

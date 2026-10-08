import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AskResult } from '@/lib/product-ask';

const actions = vi.hoisted(() => ({ askAboutProduct: vi.fn() }));
vi.mock('@/app/actions/product-ask', () => actions);

import { AskProduct } from './AskProduct';

afterEach(cleanup);
beforeEach(() => actions.askAboutProduct.mockReset());

const result = (over: Partial<AskResult> = {}): AskResult => ({
  question: 'How long does the battery last?',
  answer: null,
  terms: ['battery', 'last'],
  source: 'rules',
  snippets: [
    { kind: 'details', text: 'Up to 30 hours of battery life' },
    { kind: 'qa', text: 'About 26 hours.', question: 'Does the battery last?' },
    { kind: 'review', text: 'Battery for days', rating: 5 },
  ],
  ...over,
});

async function ask(text: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Ask about this item' }), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  });
}

it('shows the matching passages with where they are from, matches in bold', async () => {
  actions.askAboutProduct.mockResolvedValue({ ok: true, result: result() });
  render(<AskProduct productId="p1" suggestions={[]} />);
  expect(screen.getByRole('heading', { name: 'Looking for specific info?' })).toBeInTheDocument();
  await ask('How long does the battery last?');
  expect(actions.askAboutProduct).toHaveBeenCalledWith('p1', 'How long does the battery last?');
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(within(items[0]).getByText('From the product details')).toBeInTheDocument();
  expect(within(items[0]).getByText('battery', { selector: 'strong' })).toBeInTheDocument();
  expect(items[1]).toHaveTextContent('From customer Q&AQ: Does the battery last?A: About 26 hours.');
  expect(items[2]).toHaveTextContent('From a 5-star review“Battery for days”');
  expect(screen.queryByText(/AI-generated/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Ask other shoppers' })).toHaveAttribute('href', '#questions');
});

it('puts an AI answer on top, saying where it came from', async () => {
  actions.askAboutProduct.mockResolvedValue({ ok: true, result: result({ answer: 'Up to 30 hours, about 26 with noise cancelling.', source: 'ai' }) });
  render(<AskProduct productId="p1" suggestions={[]} />);
  await ask('battery?');
  expect(screen.getByText('Up to 30 hours, about 26 with noise cancelling.')).toBeInTheDocument();
  expect(screen.getByText(/AI-generated from the product details, customer Q&A and reviews below/)).toBeInTheDocument();
});

it('says when nothing matches', async () => {
  actions.askAboutProduct.mockResolvedValue({ ok: true, result: result({ question: 'Is it waterproof?', snippets: [], terms: ['waterproof'] }) });
  render(<AskProduct productId="p1" suggestions={[]} />);
  await ask('Is it waterproof?');
  expect(screen.getByText('Nothing about “Is it waterproof?” in the product details, customer Q&A or reviews.')).toBeInTheDocument();
});

it('asks a suggestion in one click', async () => {
  actions.askAboutProduct.mockResolvedValue({ ok: true, result: result() });
  render(<AskProduct productId="p1" suggestions={['How long does the battery last?', 'Is it comfortable?']} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Is it comfortable?' }));
  });
  expect(actions.askAboutProduct).toHaveBeenCalledWith('p1', 'Is it comfortable?');
  expect(screen.getByRole('searchbox', { name: 'Ask about this item' })).toHaveValue('Is it comfortable?');
});

it('checks the length first, and shows errors', async () => {
  render(<AskProduct productId="p1" suggestions={[]} />);
  await ask('ab');
  expect(actions.askAboutProduct).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Type a question of at least 3 characters.');
  actions.askAboutProduct.mockResolvedValue({ ok: false, code: 'product_not_found', message: 'That product is not available in this store.' });
  await ask('battery');
  expect(screen.getByRole('alert')).toHaveTextContent('That product is not available in this store.');
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ListChoice } from '@/lib/data/collections';

const calls = vi.hoisted(() => ({
  add: [] as string[][],
  remove: [] as string[][],
  create: [] as string[][],
  push: [] as string[],
  toasts: [] as string[],
  result: {} as object,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: (to: string) => calls.push.push(to) }) }));
vi.mock('../decision/Toast', () => ({ useToast: () => ({ toast: (m: string) => calls.toasts.push(m) }) }));
vi.mock('@/app/actions/collections', () => ({
  addToCollection: async (...a: string[]) => { calls.add.push(a); return calls.result; },
  removeFromCollection: async (...a: string[]) => { calls.remove.push(a); return calls.result; },
  createCollectionWith: async (...a: string[]) => { calls.create.push(a); return calls.result; },
}));

import { AddToList } from './AddToList';

afterEach(() => {
  cleanup();
  calls.add = [];
  calls.remove = [];
  calls.create = [];
  calls.push = [];
  calls.toasts = [];
  calls.result = {};
});

const LISTS: ListChoice[] = [
  { id: 'c', name: "Things I'm Considering", kind: 'considering', has: false },
  { id: 'w', name: 'Wedding registry', kind: 'custom', has: true },
];
const show = (lists: ListChoice[] | null = LISTS) =>
  render(<AddToList productId="p1" productName="Kettle" market="IN" lists={lists} />);
const open = () => fireEvent.click(screen.getByRole('button', { name: /Add to List/ }));

it('sends signed-out shoppers to sign in, then back here', () => {
  window.history.replaceState(null, '', '/in/product/p1?ref=x');
  show(null);
  open();
  expect(calls.push).toEqual([`/in/signin?next=${encodeURIComponent('/in/product/p1?ref=x')}`]);
  expect(screen.queryByRole('group')).toBeNull();
});

it('ticks a list to add the product and unticks one to take it off', async () => {
  calls.result = { ok: true };
  show();
  open();
  expect(screen.getByRole('button', { name: /Add to List/ })).toHaveAttribute('aria-expanded', 'true');
  const considering = screen.getByRole('checkbox', { name: "Things I'm Considering" });
  const wedding = screen.getByRole('checkbox', { name: 'Wedding registry' });
  expect(considering).not.toBeChecked();
  expect(wedding).toBeChecked();

  fireEvent.click(considering);
  await waitFor(() => expect(calls.toasts).toEqual(["Added to Things I'm Considering"]));
  expect(calls.add).toEqual([['c', 'p1']]);

  fireEvent.click(wedding);
  await waitFor(() => expect(calls.toasts).toContain('Removed from Wedding registry'));
  expect(calls.remove).toEqual([['w', 'p1']]);
  expect(screen.getByRole('link', { name: 'View your lists' })).toHaveAttribute('href', '/in/collections');
});

it('makes a new list with the product on it, and says when the name is taken', async () => {
  calls.result = { error: 'duplicate', message: 'You have already done that.' };
  show();
  open();
  fireEvent.click(screen.getByRole('button', { name: '+ New list' }));
  fireEvent.change(screen.getByLabelText('New list'), { target: { value: 'Wedding registry' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByText('You already have a list with that name.')).toBeTruthy();
  expect(calls.create).toEqual([['Wedding registry', 'p1']]);

  calls.result = { collection: { id: 'n', name: 'Diwali gifts' } };
  fireEvent.change(screen.getByLabelText('New list'), { target: { value: 'Diwali gifts' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(calls.toasts).toEqual(['Added to Diwali gifts']));
  expect(screen.queryByLabelText('New list')).toBeNull();
});

it('opens straight to the new-list form when there are no lists yet', () => {
  show([]);
  open();
  expect(screen.getByText(/You don’t have any lists yet/)).toBeTruthy();
  expect(screen.getByLabelText('New list')).toBeTruthy();
});

it('closes on Escape and hands focus back', () => {
  show();
  open();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('group')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: /Add to List/ }));
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ move: [] as string[][], details: [] as unknown[][], refresh: 0, toasts: [] as string[], result: {} as object }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => { calls.refresh += 1; }, push: () => {} }) }));
vi.mock('../decision/Toast', () => ({ useToast: () => ({ toast: (m: string) => calls.toasts.push(m) }) }));
vi.mock('@/app/collections/actions', () => ({ addToCartQuiet: async () => ({ ok: true, count: 1 }) }));
vi.mock('@/app/actions/collections', () => ({
  createCollection: async () => ({}),
  deleteCollection: async () => ({}),
  removeFromCollection: async () => ({ ok: true }),
  renameCollection: async () => ({}),
  updateCollectionNote: async () => ({}),
  moveToCollection: async (...a: string[]) => { calls.move.push(a); return calls.result; },
  setListItemDetails: async (...a: unknown[]) => { calls.details.push(a); return calls.result; },
}));

import { ItemActions, ItemDetails } from './CollectionControls';

afterEach(() => {
  cleanup();
  calls.move = [];
  calls.details = [];
  calls.refresh = 0;
  calls.toasts = [];
  calls.result = {};
});

const TARGETS = [{ id: 'w', name: 'Wedding registry' }, { id: 'l', name: 'Saved for later' }];
const show = (over: Partial<Parameters<typeof ItemActions>[0]> = {}) =>
  render(
    <ItemActions collectionId="c" collectionName="Things I'm Considering" productId="p1" productName="Kettle" inStock market="US" moveTo={TARGETS} {...over} />,
  );

it('moves an item onto another of the shopper’s lists', async () => {
  calls.result = { ok: true };
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Move Kettle to another list' }));
  expect(screen.getByRole('group', { name: 'Move to' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Wedding registry' }));
  await waitFor(() => expect(calls.refresh).toBe(1));
  expect(calls.move).toEqual([['c', 'w', 'p1']]);
  expect(calls.toasts).toEqual(['Moved to Wedding registry']);
  expect(screen.queryByRole('group', { name: 'Move to' })).toBeNull();
});

it('says why a move didn’t happen', async () => {
  calls.result = { error: 'collection_item_limit', message: 'A collection can hold up to 200 items.' };
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Move Kettle to another list' }));
  fireEvent.click(screen.getByRole('button', { name: 'Saved for later' }));
  await waitFor(() => expect(calls.toasts).toEqual(['A collection can hold up to 200 items.']));
  expect(calls.refresh).toBe(0);
});

it('offers no move with nowhere to go, or for an item that’s gone', () => {
  show({ moveTo: [] });
  expect(screen.queryByRole('button', { name: /Move Kettle/ })).toBeNull();
  cleanup();
  show({ unavailable: true });
  expect(screen.queryByRole('button', { name: /Move Kettle/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Remove Kettle from Things I\'m Considering' })).toBeTruthy();
});

const details = (over: Partial<Parameters<typeof ItemDetails>[0]> = {}) =>
  render(<ItemDetails collectionId="c" productId="p1" productName="Kettle" market="US" {...over} />);

it('adds a comment, quantity and priority to an item', async () => {
  calls.result = { item: {} };
  details();
  fireEvent.click(screen.getByRole('button', { name: 'Add comment, quantity & priority for Kettle' }));
  const form = screen.getByRole('form', { name: 'Comment, quantity and priority for Kettle' });
  expect((screen.getByLabelText('Quantity') as HTMLInputElement).value).toBe('1');
  expect((screen.getByLabelText('Priority') as HTMLSelectElement).value).toBe('medium');
  fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'Any color but yellow' } });
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } });
  fireEvent.submit(form);
  await waitFor(() => expect(calls.refresh).toBe(1));
  expect(calls.details).toEqual([['c', 'p1', { comment: 'Any color but yellow', quantity: '2', priority: 'high' }]]);
  expect(calls.toasts).toEqual(['Saved']);
  expect(screen.queryByRole('form')).toBeNull();
});

it('edits what’s there, and says why a save didn’t happen', async () => {
  calls.result = { error: 'invalid_input', message: 'Keep the comment under 250 characters.' };
  details({ comment: 'Blue', quantity: 3, priority: 'lowest' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit comment, quantity & priority for Kettle' }));
  expect((screen.getByLabelText('Comment') as HTMLTextAreaElement).value).toBe('Blue');
  expect((screen.getByLabelText('Quantity') as HTMLInputElement).value).toBe('3');
  expect((screen.getByLabelText('Priority') as HTMLSelectElement).value).toBe('lowest');
  fireEvent.submit(screen.getByRole('form'));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', '⚠Keep the comment under 250 characters.');
  expect(calls.refresh).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('form')).toBeNull();
});

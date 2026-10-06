import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ share: [] as string[], unshare: [] as string[], refresh: 0, result: {} as object }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => { calls.refresh += 1; }, push: () => {} }) }));
vi.mock('@/app/actions/collections', () => ({
  shareCollection: async (id: string) => { calls.share.push(id); return calls.result; },
  unshareCollection: async (id: string) => { calls.unshare.push(id); return calls.result; },
}));

import { ShareList } from './ShareList';

afterEach(() => {
  cleanup();
  calls.share = [];
  calls.unshare = [];
  calls.refresh = 0;
  calls.result = {};
});

it('turns on a link for a private list', async () => {
  calls.result = { token: 'a'.repeat(32) };
  render(<ShareList id="c1" name="Wedding registry" market="US" url={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Share list' }));
  await waitFor(() => expect(calls.refresh).toBe(1));
  expect(calls.share).toEqual(['c1']);
});

it('shows a shared list’s link to copy, and turns it off', async () => {
  const url = `https://shop.example/lists/${'a'.repeat(32)}`;
  calls.result = { ok: true };
  render(<ShareList id="c1" name="Wedding registry" market="US" url={url} />);
  expect(screen.getByLabelText('Link to this list')).toHaveProperty('value', url);
  expect(screen.getByRole('link', { name: 'View as others see it' })).toHaveAttribute('href', url);
  expect(screen.getByText(/Your note and the prices you saved at stay private/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
  await waitFor(() => expect(calls.unshare).toEqual(['c1']));
});

it('says when sharing couldn’t change', async () => {
  calls.result = { error: 'collection_not_found' };
  render(<ShareList id="c1" name="Wedding registry" market="US" url={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Share list' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', '⚠ Couldn\'t change sharing. Try again.');
  expect(calls.refresh).toBe(0);
});

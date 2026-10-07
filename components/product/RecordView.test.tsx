import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RecordView } from './RecordView';

const recent = () => decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('recent:v1='))?.slice('recent:v1='.length) ?? '');
const expire = (name: string) => (document.cookie = `${name}=; path=/; max-age=0`);

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
const sent = () => fetchMock.mock.calls.map((c) => {
  const [url, init] = c as unknown as [string, RequestInit];
  return [url, JSON.parse(String(init.body))];
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  expire('recent:v1');
  expire('recent:off');
});

it('records views newest first', () => {
  render(<RecordView productId="a" />);
  cleanup();
  render(<RecordView productId="b" />);
  expect(recent()).toBe('b,a');
});

it('records nothing while history is paused', () => {
  document.cookie = 'recent:off=1; path=/';
  render(<RecordView productId="a" />);
  expect(recent()).toBe('');
});

it('counts a view with the products looked at just before, but not a reload or a first view', () => {
  render(<RecordView productId="a" />);
  cleanup();
  expect(fetchMock).not.toHaveBeenCalled();

  render(<RecordView productId="b" />);
  cleanup();
  expect(sent()).toEqual([['/api/v1/products/b/views', { recent: ['a'] }]]);

  // the same page again: nothing new to count
  render(<RecordView productId="b" />);
  cleanup();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  for (const id of ['c', 'd', 'e', 'f', 'g']) {
    render(<RecordView productId={id} />);
    cleanup();
  }
  // up to 5, newest first
  expect(sent().at(-1)).toEqual(['/api/v1/products/g/views', { recent: ['f', 'e', 'd', 'c', 'b'] }]);
});

it('counts nothing while history is paused', () => {
  document.cookie = 'recent:v1=a; path=/';
  document.cookie = 'recent:off=1; path=/';
  render(<RecordView productId="b" />);
  expect(fetchMock).not.toHaveBeenCalled();
});

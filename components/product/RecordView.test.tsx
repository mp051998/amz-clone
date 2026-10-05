import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { RecordView } from './RecordView';

const recent = () => decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('recent:v1='))?.slice('recent:v1='.length) ?? '');
const expire = (name: string) => (document.cookie = `${name}=; path=/; max-age=0`);

afterEach(() => {
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

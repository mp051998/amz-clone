import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createMockProvider } from '../providers/mock';
import type { LensImage } from '../../lens';
import { describeForSearch } from './lens';

const off = { cache: false } as const;
const photo: LensImage = { mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQ==' };

afterEach(() => vi.restoreAllMocks());

describe('describeForSearch', () => {
  it('sends the photo with the prompt and tidies the search', async () => {
    const p = createMockProvider([JSON.stringify({ found: true, query: ' "Black leather crossbody bag." ' })]);
    expect(await describeForSearch(photo, { provider: p, ...off })).toBe('Black leather crossbody bag');
    expect(p.calls[0].images).toEqual([photo]);
    expect(p.calls[0].json).toBe(true);
    expect(p.calls[0].prompt).toContain('"found":true|false');
  });

  it('is null when the model sees no product, or there is no provider', async () => {
    expect(await describeForSearch(photo, { provider: createMockProvider([JSON.stringify({ found: false, query: '' })]), ...off })).toBeNull();
    expect(await describeForSearch(photo, { provider: createMockProvider([JSON.stringify({ found: true, query: '...' })]), ...off })).toBeNull();
    expect(await describeForSearch(photo, { provider: null })).toBeNull();
  });

  it('is null, never throws, when the model fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await describeForSearch(photo, { provider: createMockProvider([new Error('quota')]), ...off })).toBeNull();
    expect(await describeForSearch(photo, { provider: createMockProvider(['not json']), ...off })).toBeNull();
  });
});

import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createMockProvider } from '../ai/providers/mock';
import { searchByImage } from './lens';

const off = { cache: false } as const;
const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

it('turns away anything but a photo', async () => {
  await expect(searchByImage({ image: 'hello', mimeType: 'text/plain' }, { provider: null })).rejects.toMatchObject({ code: 'invalid_input', detail: 'image' });
  await expect(searchByImage({}, { provider: null })).rejects.toMatchObject({ code: 'invalid_input', detail: 'image' });
});

it('searches for what the AI sees', async () => {
  const p = createMockProvider([JSON.stringify({ found: true, query: 'french press' })]);
  expect(await searchByImage({ image, name: 'IMG_1.jpg' }, { provider: p, ...off })).toEqual({ query: 'french press', source: 'ai' });
});

it('falls back to the file’s name, or nothing', async () => {
  expect(await searchByImage({ image, name: 'blue-yoga-mat.jpg' }, { provider: null })).toEqual({ query: 'blue yoga mat', source: 'rules' });
  const none = createMockProvider([JSON.stringify({ found: false, query: '' })]);
  expect(await searchByImage({ image, name: 'IMG_1.jpg' }, { provider: none, ...off })).toEqual({ query: null, source: 'rules' });
});

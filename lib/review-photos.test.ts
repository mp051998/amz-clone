import { expect, it } from 'vitest';
import type { Db } from './db/client';
import { upsertReview } from './data/reviews';
import { REVIEW_PHOTO_MAX_BYTES, reviewPhoto, reviewPhotoFileError } from './review-photos';

it('takes JPEG, PNG and WebP photos up to 3 MB', () => {
  expect(reviewPhotoFileError({ type: 'image/jpeg', size: 1000 })).toBeNull();
  expect(reviewPhotoFileError({ type: 'image/webp', size: REVIEW_PHOTO_MAX_BYTES })).toBeNull();
  expect(reviewPhotoFileError({ type: 'image/gif', size: 1000 })).toBe('Use a JPEG, PNG or WebP photo.');
  expect(reviewPhotoFileError({ type: 'image/png', size: REVIEW_PHOTO_MAX_BYTES + 1 })).toBe('Photos can be up to 3 MB.');
  expect(reviewPhotoFileError({ type: 'image/png', size: 0 })).toBe('That photo is empty.');
});

it('serves a photo from the public bucket', () => {
  const p = reviewPhoto('u1/abc.jpg');
  expect(p.path).toBe('u1/abc.jpg');
  expect(p.url).toMatch(/\/storage\/v1\/object\/public\/review-photos\/u1\/abc\.jpg$/);
});

it('turns away photos that are not the writer’s own, repeats, or more than five', async () => {
  const input = { rating: 5, title: 'Good', body: 'Works well.' };
  const write = (photos: unknown) => upsertReview({} as Db, 'p1', 'u1', { ...input, photos });
  for (const photos of [['u2/a.jpg'], ['u1/a.jpg', 'u1/a.jpg'], ['u1/1.jpg', 'u1/2.jpg', 'u1/3.jpg', 'u1/4.jpg', 'u1/5.jpg', 'u1/6.jpg'], 'u1/a.jpg', [7]]) {
    await expect(write(photos)).rejects.toMatchObject({ code: 'invalid_input', detail: 'photos', message: 'Add up to 5 of your own photos.' });
  }
});

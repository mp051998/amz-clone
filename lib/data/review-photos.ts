import type { Db } from '../db/client';
import { REVIEW_PHOTO_BUCKET, REVIEW_PHOTO_TYPES, reviewPhoto, reviewPhotoFileError } from '../review-photos';
import type { ReviewPhoto } from '../types';
import { DataError, unwrap } from './errors';

function randomName(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store a photo in the caller's own folder. It shows once their review lists it. */
export async function uploadReviewPhoto(db: Db, userId: string, file: File): Promise<ReviewPhoto> {
  const bad = reviewPhotoFileError(file);
  if (bad) throw new DataError('invalid_input', 'photo', bad);
  const path = `${userId}/${randomName()}.${REVIEW_PHOTO_TYPES[file.type]}`;
  const { error } = await db.storage.from(REVIEW_PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    if (/row-level security|unauthorized/i.test(error.message)) throw new DataError('forbidden', 'photo');
    throw new DataError('invalid_input', 'photo', 'The photo could not be uploaded. Try again.');
  }
  return reviewPhoto(path);
}

/** Clear away photos no review shows any more (best effort: a leftover file is harmless). */
export async function removeReviewPhotos(db: Db, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await db.storage.from(REVIEW_PHOTO_BUCKET).remove(paths);
  if (error) console.error('[review-photos] remove failed', paths.length, error.message);
}

export interface CustomerImage extends ReviewPhoto {
  reviewId: string;
  rating: number;
  author: string;
}

/** "Customer images": the newest photos from a product's visible reviews. */
export async function customerImages(db: Db, productId: string, limit = 12): Promise<CustomerImage[]> {
  const rows = unwrap(
    await db
      .from('reviews')
      .select('id, rating, author_name, photos')
      .eq('product_id', productId)
      .is('hidden_at', null)
      .filter('photos', 'neq', '{}')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit),
  );
  return rows
    .flatMap((r) => r.photos.map((p) => ({ ...reviewPhoto(p), reviewId: r.id, rating: r.rating, author: r.author_name })))
    .slice(0, limit);
}

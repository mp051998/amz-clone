import { SUPABASE_URL } from './supabase/config';
import type { ReviewPhoto } from './types';

/**
 * Photos on reviews: up to 5 per review, in the public `review-photos` bucket under the author's own
 * folder (`<user id>/<random>.<ext>`). Reviews keep the paths; pages show the public URLs.
 */
export const REVIEW_PHOTO_BUCKET = 'review-photos';
export const REVIEW_PHOTO_MAX = 5;
export const REVIEW_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function reviewPhotoUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${REVIEW_PHOTO_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function reviewPhoto(path: string): ReviewPhoto {
  return { path, url: reviewPhotoUrl(path) };
}

/** Why a file can't be a review photo (type or size), or null when it can. */
export function reviewPhotoFileError(file: { type: string; size: number }): string | null {
  if (!REVIEW_PHOTO_TYPES[file.type]) return 'Use a JPEG, PNG or WebP photo.';
  if (!file.size) return 'That photo is empty.';
  if (file.size > REVIEW_PHOTO_MAX_BYTES) return 'Photos can be up to 3 MB.';
  return null;
}

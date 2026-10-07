import { json, preflight, requireUser, route } from '@/lib/api/http';
import { DataError } from '@/lib/data/errors';
import { uploadReviewPhoto } from '@/lib/data/review-photos';

/**
 * POST /api/v1/me/review-photos — multipart/form-data with one image in `photo` (JPEG, PNG or WebP,
 * up to 3 MB). Returns `{photo: {path, url}}`; list `path` in a review's `photos` to show it.
 */
export const POST = route(async (ctx) => {
  const user = requireUser(ctx);
  if (!/^multipart\/form-data\b/i.test(ctx.req.headers.get('content-type') ?? '')) throw new DataError('unsupported_media_type');
  let form: FormData;
  try {
    form = await ctx.req.formData();
  } catch {
    throw new DataError('invalid_input', 'photo', 'Send the photo as multipart/form-data.');
  }
  const file = form.get('photo');
  if (!(file instanceof File)) throw new DataError('invalid_input', 'photo', 'Send the photo in a `photo` field.');
  return json({ photo: await uploadReviewPhoto(ctx.db, user.id, file) }, { status: 201 });
});

export const OPTIONS = preflight;

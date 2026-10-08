import { body, json, preflight, route } from '@/lib/api/http';
import { searchByImage } from '@/lib/data/lens';

/**
 * POST /api/v1/searches/image { image, mimeType?, name? } — search by image (Amazon Lens): what to
 * search for to find the thing in a photo. `image` is a JPEG, PNG or WebP of up to 1.5 MB, base64
 * with its `mimeType` or a data: URL; `name` is the file's name. Answers `{query, source}`: `ai`
 * when the store's AI named it, `rules` when only the file's name could (or nothing could: `query`
 * null). Search with `GET /products?q=`. `422 invalid_input` (`image`) for anything else.
 */
export const POST = route(async (ctx) => {
  const input = await body(ctx.req);
  return json(await searchByImage({ image: input.image, mimeType: input.mimeType, name: input.name }));
});

export const OPTIONS = preflight;

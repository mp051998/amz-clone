import 'server-only';
import { describeForSearch } from '../ai/features/lens';
import type { FeatureOptions } from '../ai';
import { lensNameQuery, readLensImage, type LensResult } from '../lens';
import { DataError } from './errors';

export interface LensInput {
  /** base64, or a data: URL */
  image?: unknown;
  mimeType?: unknown;
  /** the file's name, which may say what it is */
  name?: unknown;
}

/**
 * Search by image: what to search for to find the thing in a photo. The store's AI looks at it;
 * without one (or when it sees no product) the file's name may say. `query` is null when neither
 * can tell.
 */
export async function searchByImage(input: LensInput, opts: FeatureOptions = {}): Promise<LensResult> {
  const image = readLensImage(input.image, input.mimeType);
  if (!image) throw new DataError('invalid_input', 'image', 'Choose a JPEG, PNG or WebP photo of up to 1.5 MB.');
  const query = await describeForSearch(image, opts);
  return query ? { query, source: 'ai' } : { query: lensNameQuery(input.name), source: 'rules' };
}

/**
 * Search by image (Amazon Lens): a photo of something, turned into the words to search the store
 * for. The browser shrinks the photo to LENS_SIDE pixels and sends it as a JPEG; the store's AI
 * names what's in it (lib/ai/features/lens.ts) and, without one, the file's name may say
 * (lensNameQuery). Shared by the server and the search box.
 */

export const LENS_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** the longest side the search box shrinks a photo to */
export const LENS_SIDE = 768;
/** the most a photo may weigh, decoded */
export const LENS_MAX_BYTES = 1_500_000;
/** the longest search a photo becomes */
export const LENS_QUERY_MAX = 80;

export interface LensImage {
  mimeType: (typeof LENS_TYPES)[number];
  /** the bytes, base64 */
  data: string;
}

export interface LensResult {
  /** what to search for; null when nothing in the photo could be named */
  query: string | null;
  source: 'ai' | 'rules';
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** how each type's bytes start, in base64 */
const MAGIC: Record<LensImage['mimeType'], string> = { 'image/jpeg': '/9j/', 'image/png': 'iVBORw0KGgo', 'image/webp': 'UklGR' };

/**
 * A photo as sent: base64 with its `mimeType`, or a data: URL (whose type wins). Null unless it's
 * a JPEG, PNG or WebP that starts like one, of at most LENS_MAX_BYTES.
 */
export function readLensImage(image: unknown, mimeType?: unknown): LensImage | null {
  if (typeof image !== 'string') return null;
  const url = /^data:([^;,]+);base64,/i.exec(image);
  const type = (url ? url[1] : typeof mimeType === 'string' ? mimeType : '').trim().toLowerCase();
  if (!(LENS_TYPES as readonly string[]).includes(type)) return null;
  const data = (url ? image.slice(url[0].length) : image).replace(/\s+/g, '');
  if (!data || data.length % 4 !== 0 || !BASE64.test(data) || (data.length / 4) * 3 > LENS_MAX_BYTES + 2) return null;
  const mime = type as LensImage['mimeType'];
  return data.startsWith(MAGIC[mime]) ? { mimeType: mime, data } : null;
}

/** words a camera, phone or browser puts in a file name, which say nothing about what's in it */
const NOISE = new Set(
  (
    'img image images dsc dscn dscf pxl photo photos pic pics picture pictures screenshot screen shot snapshot whatsapp ' +
    'untitled copy edited edit final download downloaded file scan camera jpeg jpg png webp heic gif new from the and with ' +
    'for my our this that'
  ).split(' '),
);

/**
 * What the file's name says it is ("red-running-shoes (1).jpg" → "red running shoes"): its words
 * of three or more letters, without camera and screenshot noise, at most six. Null for names that
 * say nothing ("IMG_2041.jpg", "Screenshot 2026-10-09 at 9.41 PM.png", a hash).
 */
export function lensNameQuery(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '');
  // a hash or an id (a UUID's groups too)
  if (/[0-9a-f]{8,}/i.test(base)) return null;
  const words = base
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}]+/u)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && /[aeiouy]/.test(w) && !NOISE.has(w));
  const unique = [...new Set(words)].slice(0, 6);
  return unique.length ? unique.join(' ') : null;
}

/** A search as the AI wrote it, tidied: no quotes or trailing punctuation, at most LENS_QUERY_MAX characters at a word. */
export function tidyLensQuery(q: string): string | null {
  let s = q.replace(/["“”‘’`]/g, '').replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/, '');
  if (s.length > LENS_QUERY_MAX) s = s.slice(0, LENS_QUERY_MAX).replace(/\s+\S*$/, '');
  return /\p{L}{2}/u.test(s) ? s : null;
}

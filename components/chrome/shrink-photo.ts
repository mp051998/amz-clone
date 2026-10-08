import { LENS_SIDE } from '@/lib/lens';

/**
 * A photo shrunk to `side` pixels on its longest side and flattened onto white, as a JPEG data:
 * URL, small enough to send for a search by image. Null when the browser can't read it (a HEIC
 * outside Safari, say).
 */
export async function shrinkPhoto(file: Blob, side = LENS_SIDE): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

/**
 * Seeded catalog images are 400px (public/products/<id>.jpg, India: public/products/in/<id>.jpg)
 * so cards stay light; each has a 1000px copy under zoom/ (scripts/fetch-zoom-images.mjs) for the
 * product page hover zoom and full view. Any other image (an admin upload, a URL) is used as is.
 */
const SEEDED = /^\/products\/(in\/)?([A-Za-z0-9]+\.jpg)$/;

/** the large copy of a product image, for zooming; the image itself when there's none. */
export function zoomImage(src: string): string {
  const m = SEEDED.exec(src);
  return m ? `/products/${m[1] ?? ''}zoom/${m[2]}` : src;
}

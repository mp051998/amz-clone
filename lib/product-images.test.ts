import { describe, expect, it } from 'vitest';
import { zoomImage } from './product-images';

describe('zoomImage', () => {
  it('maps seeded images in both stores to their zoom copy', () => {
    expect(zoomImage('/products/6181VJVcgSL.jpg')).toBe('/products/zoom/6181VJVcgSL.jpg');
    expect(zoomImage('/products/in/61BWskzWNIL.jpg')).toBe('/products/in/zoom/61BWskzWNIL.jpg');
  });

  it('leaves uploads, URLs and anything else alone', () => {
    for (const src of [
      'https://xyz.supabase.co/storage/v1/object/public/product-images/a/b.jpg',
      '/products/zoom/6181VJVcgSL.jpg',
      '/products/a/b.jpg',
      '/products/x.png',
      '/campaigns/hero.jpg',
    ]) {
      expect(zoomImage(src)).toBe(src);
    }
  });
});

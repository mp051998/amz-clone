import { describe, expect, it } from 'vitest';
import { LENS_MAX_BYTES, LENS_QUERY_MAX, lensNameQuery, readLensImage, tidyLensQuery } from './lens';

const jpeg = '/9j/4AAQSkZJRgABAQ==';
const png = 'iVBORw0KGgoAAAANSUhEUg==';

describe('readLensImage', () => {
  it('takes base64 with its type, or a data: URL', () => {
    expect(readLensImage(jpeg, 'image/jpeg')).toEqual({ mimeType: 'image/jpeg', data: jpeg });
    expect(readLensImage(`data:image/png;base64,${png}`)).toEqual({ mimeType: 'image/png', data: png });
    expect(readLensImage(`data:image/png;base64,${png}`, 'image/jpeg')).toEqual({ mimeType: 'image/png', data: png });
    expect(readLensImage(` ${jpeg.slice(0, 8)}\n${jpeg.slice(8)} `, 'IMAGE/JPEG')).toEqual({ mimeType: 'image/jpeg', data: jpeg });
  });

  it('turns away other types, bytes that don’t start like the type, bad base64 and big photos', () => {
    expect(readLensImage(jpeg, 'image/gif')).toBeNull();
    expect(readLensImage(jpeg)).toBeNull();
    expect(readLensImage(png, 'image/jpeg')).toBeNull();
    expect(readLensImage('/9j/!!!!', 'image/jpeg')).toBeNull();
    expect(readLensImage('/9j/4AA', 'image/jpeg')).toBeNull();
    expect(readLensImage(42, 'image/jpeg')).toBeNull();
    const big = `/9j/${'A'.repeat(Math.ceil((LENS_MAX_BYTES * 4) / 3) + 8)}`;
    expect(readLensImage(big.slice(0, big.length - (big.length % 4)), 'image/jpeg')).toBeNull();
  });
});

describe('lensNameQuery', () => {
  it('reads what a file’s name says it is', () => {
    expect(lensNameQuery('red-running-shoes (1).jpg')).toBe('red running shoes');
    expect(lensNameQuery('StainlessSteelFrenchPress.png')).toBe('stainless steel french press');
    expect(lensNameQuery('photo_of_my_new_desk_lamp_final.jpeg')).toBe('desk lamp');
  });

  it('says nothing for camera, screenshot and hashed names', () => {
    expect(lensNameQuery('IMG_2041.jpg')).toBeNull();
    expect(lensNameQuery('PXL_20261009_101500123.jpg')).toBeNull();
    expect(lensNameQuery('Screenshot 2026-10-09 at 9.41.12 PM.png')).toBeNull();
    expect(lensNameQuery('3f2a9c1e-77b0-4d5e-9a1b-2c3d4e5f6a7b.webp')).toBeNull();
    expect(lensNameQuery(undefined)).toBeNull();
  });
});

describe('tidyLensQuery', () => {
  it('drops quotes and end punctuation, and clips at a word', () => {
    expect(tidyLensQuery('  "Black leather  crossbody bag." ')).toBe('Black leather crossbody bag');
    const long = tidyLensQuery('word '.repeat(30))!;
    expect(long.length).toBeLessThanOrEqual(LENS_QUERY_MAX);
    expect(long.endsWith('word')).toBe(true);
    expect(tidyLensQuery(' ?! ')).toBeNull();
  });
});

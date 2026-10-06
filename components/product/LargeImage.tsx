'use client';
import { useState, type ImgHTMLAttributes } from 'react';
import { zoomImage } from '@/lib/product-images';

/** A product image at its large (zoom) size, falling back to the image itself if that won't load. */
export function LargeImage({ src, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }) {
  const [failed, setFailed] = useState(false);
  const large = zoomImage(src);
  return <img {...rest} src={failed ? src : large} onError={() => setFailed(true)} />;
}

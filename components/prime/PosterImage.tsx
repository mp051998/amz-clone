'use client';
import { useState } from 'react';

/** Poster art that fills its tile; if the image is missing/broken it hides itself,
 *  revealing the gradient placeholder underneath. Client-only (needs onError). */
export function PosterImage({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      onError={() => setOk(false)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

'use client';
import { useState } from 'react';
import { ProductFrame } from '../decision/ProductFrame';
import { cn } from '../lib/cn';

export interface GalleryProps {
  /** the main image first, then the gallery (products.gallery). */
  images: string[];
  alt: string;
}

/**
 * PDP gallery (prototype Product detail): 1/1 hero frame (radius 14, line border), with a thumb
 * per image when there's more than one. A single image shows on its own.
 */
export function Gallery({ images, alt }: GalleryProps) {
  const [pick, setPick] = useState(0);
  const shots = images.length ? images : [null];
  const cur = Math.min(pick, shots.length - 1);
  const many = shots.length > 1;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <ProductFrame
        src={shots[cur]}
        alt={many ? `${alt}, image ${cur + 1} of ${shots.length}` : alt}
        aspect="1/1"
        radius="panel"
        label="product shot"
        priority
      />
      {many ? (
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Product images">
          {shots.map((src, i) => (
            <button
              key={`${i}-${src}`}
              type="button"
              onClick={() => setPick(i)}
              aria-pressed={i === cur}
              aria-label={`Show image ${i + 1} of ${shots.length}`}
              className={cn('relative overflow-hidden rounded-image border-2 p-0', i === cur ? 'border-ink' : 'border-transparent hover:border-line-3')}
            >
              <ProductFrame src={src} aspect="1/1" inset="12%" label={`image ${i + 1}`} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

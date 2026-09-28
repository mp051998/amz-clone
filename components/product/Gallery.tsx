'use client';
import { useState } from 'react';
import { ProductFrame } from '../decision/ProductFrame';
import { cn } from '../lib/cn';

export interface GalleryProps {
  /** real images; one image is reused across the four views. */
  images: string[];
  alt: string;
}

const VIEWS = ['front', 'side', 'detail', 'in use'];

/**
 * PDP gallery (prototype Product detail): 1/1 hero frame (radius 14, line border) + four thumbs.
 * The catalog has one shot per product, so the thumbs reuse it and carry view labels.
 */
export function Gallery({ images, alt }: GalleryProps) {
  const [pick, setPick] = useState(0);
  const shots = VIEWS.map((label, i) => ({ label, src: images.length ? images[i % images.length] : null }));
  const cur = shots[pick];
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <ProductFrame src={cur.src} alt={alt} aspect="1/1" radius="panel" label={`product shot · ${cur.label}`} priority />
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Product views">
        {shots.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setPick(i)}
            aria-pressed={i === pick}
            aria-label={`Show ${s.label} view`}
            className={cn('relative overflow-hidden rounded-image border-2 p-0', i === pick ? 'border-ink' : 'border-transparent hover:border-line-3')}
          >
            <ProductFrame src={s.src} aspect="1/1" inset="12%" label={s.label} />
            {images.length < 2 ? (
              <span className="absolute inset-x-0 bottom-0 bg-surface/85 py-0.5 text-center font-mono text-[10px] text-ink-3">{s.label}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

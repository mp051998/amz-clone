'use client';
import { useCallback, useRef, useState, type MouseEvent } from 'react';
import { ProductFrame } from '../decision/ProductFrame';
import { cn } from '../lib/cn';
import { ImageViewer } from './ImageViewer';
import { LargeImage } from './LargeImage';

export interface GalleryProps {
  /** the main image first, then the gallery (products.gallery). */
  images: string[];
  alt: string;
}

/** how far the hover lens magnifies the hero image */
export const LENS_ZOOM = 2.5;

/** true for a mouse / trackpad (hover zoom); touch screens skip the lens and open the viewer on tap. */
function canHover(): boolean {
  return window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
}

/**
 * PDP gallery (prototype Product detail): 1/1 hero frame (radius 14, line border), with a thumb
 * per image when there's more than one. Rolling over the hero zooms in on that spot (mouse only);
 * clicking it opens the full-screen viewer on the same image.
 */
export function Gallery({ images, alt }: GalleryProps) {
  const [pick, setPick] = useState(0);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  // the large copy behind the lens: shown once it has loaded, so the first hover doesn't flash blank
  const [loaded, setLoaded] = useState<string | null>(null);
  const hero = useRef<HTMLButtonElement>(null);
  const shots = images.length ? images : [null];
  const cur = Math.min(pick, shots.length - 1);
  const many = shots.length > 1;
  const src = shots[cur];
  const real = images.filter(Boolean);

  const close = useCallback(() => {
    setOpen(false);
    hero.current?.focus();
  }, []);

  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (!src || !canHover()) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const clamp = (n: number) => Math.min(100, Math.max(0, n));
    setLens({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {src ? (
        <button
          ref={hero}
          type="button"
          onClick={() => {
            setLens(null);
            setOpen(true);
          }}
          onMouseMove={onMove}
          onMouseLeave={() => setLens(null)}
          aria-haspopup="dialog"
          aria-label={`Open full view: ${many ? `image ${cur + 1} of ${shots.length}` : alt}`}
          className="relative block w-full cursor-zoom-in rounded-panel p-0 text-left"
        >
          <ProductFrame src={src} alt={many ? `${alt}, image ${cur + 1} of ${shots.length}` : alt} aspect="1/1" radius="panel" label="product shot" priority />
          {lens ? (
            <span
              aria-hidden
              data-testid="zoom-lens"
              className={cn('hatch pointer-events-none absolute inset-0 overflow-hidden rounded-panel border border-line', loaded !== src && 'opacity-0')}
            >
              <LargeImage
                key={src}
                src={src}
                alt=""
                decoding="async"
                onLoad={() => setLoaded(src)}
                className="absolute inset-0 h-full w-full object-contain mix-blend-multiply"
                style={{ padding: '8%', transform: `scale(${LENS_ZOOM})`, transformOrigin: `${lens.x}% ${lens.y}%` }}
              />
            </span>
          ) : null}
        </button>
      ) : (
        <ProductFrame src={null} alt={alt} aspect="1/1" radius="panel" label="product shot" />
      )}
      {src ? (
        <p className="m-0 text-center text-[12px] text-ink-3">
          <span className="hidden [@media(hover:hover)_and_(pointer:fine)]:inline">Roll over image to zoom in · click for full view</span>
          <span className="[@media(hover:hover)_and_(pointer:fine)]:hidden">Tap image for full view</span>
        </p>
      ) : null}
      {many ? (
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Product images">
          {shots.map((s, i) => (
            <button
              key={`${i}-${s}`}
              type="button"
              onClick={() => setPick(i)}
              aria-pressed={i === cur}
              aria-label={`Show image ${i + 1} of ${shots.length}`}
              className={cn('relative overflow-hidden rounded-image border-2 p-0', i === cur ? 'border-ink' : 'border-transparent hover:border-line-3')}
            >
              <ProductFrame src={s} aspect="1/1" inset="12%" label={`image ${i + 1}`} />
            </button>
          ))}
        </div>
      ) : null}
      {open && real.length ? <ImageViewer images={real} alt={alt} index={Math.min(cur, real.length - 1)} onIndexChange={setPick} onClose={close} /> : null}
    </div>
  );
}

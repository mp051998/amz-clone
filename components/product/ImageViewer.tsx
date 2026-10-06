'use client';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';
import { LargeImage } from './LargeImage';

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
/** how far the image scales when zoomed in the viewer */
export const VIEWER_ZOOM = 2.5;
/** a horizontal drag this long (px) flips to the next / previous image */
const SWIPE_PX = 48;

export interface ImageViewerProps {
  images: string[];
  alt: string;
  /** the image to open on */
  index: number;
  /** follows the shown image, so the gallery can stay in step */
  onIndexChange: (i: number) => void;
  onClose: () => void;
}

/**
 * Full-screen product image viewer (Amazon's "click to see full view"): the image large on a light
 * tile, previous / next (arrow keys and swipe too, wrapping round), click or the zoom button to
 * zoom in on a spot and move the pointer to look around, thumbnails along the bottom.
 */
export function ImageViewer({ images, alt, index, onIndexChange, onClose }: ImageViewerProps) {
  const [mounted, setMounted] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const count = images.length;
  const many = count > 1;
  const cur = Math.min(Math.max(index, 0), count - 1);

  const go = useCallback(
    (step: number) => {
      if (!many) return;
      setZoomed(false);
      onIndexChange((cur + step + count) % count);
    },
    [cur, count, many, onIndexChange],
  );
  const show = (i: number) => {
    setZoomed(false);
    onIndexChange(i);
  };

  useEffect(() => setMounted(true), []);

  // lock page scroll behind the viewer
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (mounted) closeBtn.current?.focus();
  }, [mounted]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (zoomed) setZoomed(false);
      else onClose();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const spot = (e: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return { x: 50, y: 50 };
    const clamp = (n: number) => Math.min(100, Math.max(0, n));
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  };

  const onStageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!zoomed) setOrigin(spot(e));
    setZoomed((z) => !z);
  };
  const onStagePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swipe.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
  };
  const onStagePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (zoomed && e.pointerType === 'mouse') setOrigin(spot(e));
  };
  const onStagePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || zoomed) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - start.y)) go(dx < 0 ? 1 : -1);
  };

  const src = images[cur];
  const label = many ? `${alt}, image ${cur + 1} of ${count}` : alt;
  const arrow = 'flex h-11 w-11 items-center justify-center rounded-full border border-line-3 bg-surface/90 text-[24px] leading-none text-ink shadow-sm hover:border-ink';

  const body = (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={`${alt}: images`}
      // focusable, so a click on the image keeps focus (and the keys) inside the viewer
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[80] flex flex-col bg-bg text-ink outline-none"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-[clamp(12px,3vw,24px)] py-2.5">
        <p className="m-0 min-w-0 truncate text-[14px] text-ink-2">
          {many ? <span className="tabular-nums" aria-live="polite">Image {cur + 1} of {count}</span> : <span>{alt}</span>}
        </p>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setOrigin({ x: 50, y: 50 });
              setZoomed((z) => !z);
            }}
            aria-pressed={zoomed}
            className="rounded-pill border border-line-3 px-3.5 py-1.5 text-[14px] hover:border-ink"
          >
            {zoomed ? 'Zoom out' : 'Zoom in'}
          </button>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none hover:bg-surface-2">
            ×
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-[clamp(8px,3vw,24px)] py-4">
        {/* pointer / touch stage: click zooms, drag pans, swipe flips (keyboard: the Zoom button and arrow keys) */}
        <div
          onClick={onStageClick}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          data-testid="viewer-stage"
          className={cn(
            'hatch relative h-full w-full max-w-[1100px] touch-pan-y overflow-hidden rounded-panel border border-line',
            zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in',
          )}
        >
          <LargeImage
            key={src}
            src={src}
            alt={label}
            decoding="async"
            draggable={false}
            className="absolute inset-0 h-full w-full select-none object-contain mix-blend-multiply transition-transform duration-150 ease-out motion-reduce:transition-none"
            style={{
              padding: '4%',
              transform: zoomed ? `scale(${VIEWER_ZOOM})` : undefined,
              transformOrigin: `${origin.x}% ${origin.y}%`,
            }}
          />
        </div>
        {many ? (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous image" className={cn(arrow, 'absolute left-[clamp(14px,4vw,40px)] top-1/2 -translate-y-1/2')}>
              ‹
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next image" className={cn(arrow, 'absolute right-[clamp(14px,4vw,40px)] top-1/2 -translate-y-1/2')}>
              ›
            </button>
          </>
        ) : null}
      </div>

      {many ? (
        <div className="flex items-center justify-center gap-2 border-t border-line px-3 py-3">
          <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto" role="group" aria-label="All images">
            {images.map((s, i) => (
              <button
                key={`${i}-${s}`}
                type="button"
                onClick={() => show(i)}
                aria-pressed={i === cur}
                aria-label={`Show image ${i + 1} of ${count}`}
                className={cn('hatch relative h-14 w-14 flex-none overflow-hidden rounded-image border-2 p-0', i === cur ? 'border-ink' : 'border-transparent hover:border-line-3')}
              >
                <img src={s} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain mix-blend-multiply" style={{ padding: '10%' }} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  return mounted ? createPortal(body, document.body) : null;
}

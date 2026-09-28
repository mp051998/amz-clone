import { cn } from '../lib/cn';

export interface ProductFrameProps {
  /** real product image; drawn object-contain over the hatched frame. */
  src?: string | null;
  alt?: string;
  /** shown in mono when there is no image ("product shot"). */
  label?: string;
  /** CSS aspect-ratio, e.g. '4/3' (default), '1/1'. */
  aspect?: string;
  /** radius token (default image = 8px; use 'panel' for the 14px PDP hero). */
  radius?: 'image' | 'panel';
  /** image inset from the frame edge (default 8%). */
  inset?: string;
  className?: string;
  /** eager-load above-the-fold images. */
  priority?: boolean;
}

/**
 * Hatched placeholder frame with the real product image on top (design.md §5 ProductFrame).
 * Plain <img> (as the existing cards use) so remote catalog images need no next/image config.
 */
export function ProductFrame({ src, alt = '', label = 'product shot', aspect = '4/3', radius = 'image', inset = '8%', className, priority = false }: ProductFrameProps) {
  return (
    <div
      className={cn('hatch relative w-full overflow-hidden', radius === 'panel' ? 'rounded-panel border border-line' : 'rounded-image', className)}
      style={{ aspectRatio: aspect }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute h-full w-full object-contain mix-blend-multiply"
          style={{ inset: 0, padding: inset }}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-ink-4">{label}</span>
      )}
    </div>
  );
}

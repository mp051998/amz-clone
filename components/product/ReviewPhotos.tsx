'use client';
import { useRef, useState, useTransition } from 'react';
import { uploadReviewPhoto } from '@/app/actions/review';
import type { CustomerImage } from '@/lib/data/review-photos';
import { REVIEW_PHOTO_MAX, reviewPhotoFileError } from '@/lib/review-photos';
import type { ReviewPhoto } from '@/lib/types';
import { cn } from '../lib/cn';
import { ImageViewer } from './ImageViewer';

/** A row of photo thumbnails that open the full-screen viewer. */
function Thumbs({ urls, label, size, className }: { urls: string[]; label: (i: number) => string; size: 'sm' | 'md'; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!urls.length) return null;
  return (
    <>
      <ul className={cn('m-0 flex list-none flex-wrap gap-2 p-0', className)}>
        {urls.map((url, i) => (
          <li key={url}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-haspopup="dialog"
              aria-label={label(i)}
              className={cn('block overflow-hidden rounded-image border border-line bg-surface-2 p-0 hover:border-ink', size === 'sm' ? 'size-16' : 'size-24')}
            >
              <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null ? <ImageViewer images={urls} alt="Customer photo" index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** The photos on one review. */
export function ReviewPhotoThumbs({ photos, author }: { photos: ReviewPhoto[]; author: string }) {
  return <Thumbs urls={photos.map((p) => p.url)} size="sm" label={(i) => `Open photo ${i + 1} of ${photos.length} from ${author}`} />;
}

/** "Customer images": the newest photos across the product's reviews. */
export function CustomerImages({ images }: { images: CustomerImage[] }) {
  if (!images.length) return null;
  return (
    <section aria-labelledby="customer-images-h" className="flex flex-col gap-2.5">
      <h3 id="customer-images-h" className="m-0 text-[17px] font-semibold">Customer images</h3>
      <Thumbs urls={images.map((p) => p.url)} size="md" label={(i) => `Open photo ${i + 1} of ${images.length}, from ${images[i].author}’s ${images[i].rating}-star review`} />
    </section>
  );
}

/** Add up to 5 photos to the review being written: each uploads as it's picked; × takes one off. */
export function PhotoPicker({ photos, onChange, disabled }: { photos: ReviewPhoto[]; onChange: (next: ReviewPhoto[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [error, setError] = useState('');
  const room = REVIEW_PHOTO_MAX - photos.length;

  const onPick = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (input.current) input.current.value = '';
    if (!picked.length) return;
    const bad = picked.map(reviewPhotoFileError).find(Boolean);
    if (bad) return setError(bad);
    if (picked.length > room) return setError(`You can add ${room} more ${room === 1 ? 'photo' : 'photos'} (up to ${REVIEW_PHOTO_MAX}).`);
    setError('');
    startUpload(async () => {
      const added: ReviewPhoto[] = [];
      for (const file of picked) {
        const form = new FormData();
        form.set('photo', file);
        const res = await uploadReviewPhoto(form);
        if (!res.ok) {
          setError(res.message);
          break;
        }
        added.push(res.photo);
      }
      if (added.length) onChange([...photos, ...added]);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id="rv-photos" className="text-[14px] font-semibold">Photos <span className="font-normal text-ink-3">(optional, up to {REVIEW_PHOTO_MAX})</span></span>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="rv-photos">
        {photos.map((p, i) => (
          <div key={p.path} className="relative size-16 overflow-hidden rounded-image border border-line bg-surface-2">
            <img src={p.url} alt={`Your photo ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => onChange(photos.filter((x) => x.path !== p.path))}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-full bg-ink text-[13px] leading-none text-on-ink"
            >
              ×
            </button>
          </div>
        ))}
        {room > 0 ? (
          <label className={cn('grid size-16 cursor-pointer place-items-center rounded-image border border-dashed border-line-3 text-center text-[12px] text-ink-2 hover:border-ink', (disabled || uploading) && 'pointer-events-none opacity-60')}>
            {uploading ? 'Adding…' : '+ Add'}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={disabled || uploading}
              onChange={(e) => onPick(e.target.files)}
              aria-label="Add photos"
              className="sr-only"
            />
          </label>
        ) : null}
      </div>
      {error ? <p role="alert" className="m-0 text-[13px] text-bad">⚠ {error}</p> : null}
    </div>
  );
}

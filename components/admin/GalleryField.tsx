'use client';
import { useEffect, useId, useState } from 'react';
import { Button } from '../primitives/Button';
import { cn } from '../lib/cn';
import { fieldClass } from '../lib/controls';

const IMAGE_URL = /^(\/products\/[A-Za-z0-9._/-]+|https:\/\/\S+)$/;

/**
 * The product form's extra images: the kept ones in order (hidden `gallery` inputs, reorderable
 * and removable), an "add by URL" box, and new uploads (`galleryFiles`), which go after them.
 */
export function GalleryField({ initial, max, error }: { initial: string[]; max: number; error?: string }) {
  const [urls, setUrls] = useState(initial);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p)), [previews]);
  const urlId = useId();
  const filesId = useId();
  const hintId = useId();
  const room = max - urls.length - previews.length;

  const move = (i: number, by: -1 | 1) =>
    setUrls((list) => {
      const next = [...list];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const add = () => {
    const url = draft.trim();
    if (!IMAGE_URL.test(url)) return setDraftError('Paste an https:// image URL');
    if (urls.includes(url)) return setDraftError('That image is already in the gallery');
    if (room <= 0) return setDraftError(`Up to ${max} more images`);
    setUrls((list) => [...list, url]);
    setDraft('');
    setDraftError(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {urls.length || previews.length ? (
        <ol className="m-0 grid list-none grid-cols-2 gap-2.5 p-0" aria-label="Gallery images, in order">
          {urls.map((url, i) => (
            <li key={url} className="flex flex-col gap-1.5">
              <input type="hidden" name="gallery" value={url} />
              <div className="hatch relative aspect-square overflow-hidden rounded-input border border-line-2">
                <img src={url} alt={`Image ${i + 2}`} className="absolute inset-0 h-full w-full object-contain p-[8%]" />
              </div>
              <div className="flex items-center justify-between gap-1 text-[13px]">
                <span className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move image ${i + 2} earlier`} className="rounded-input border border-line-3 px-2 py-0.5 disabled:opacity-40">←</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === urls.length - 1} aria-label={`Move image ${i + 2} later`} className="rounded-input border border-line-3 px-2 py-0.5 disabled:opacity-40">→</button>
                </span>
                <button type="button" onClick={() => setUrls((list) => list.filter((u) => u !== url))} className="text-ink-2 underline underline-offset-2 hover:text-ink">
                  Remove
                </button>
              </div>
            </li>
          ))}
          {previews.map((src, i) => (
            <li key={src} className="flex flex-col gap-1.5">
              <div className="hatch relative aspect-square overflow-hidden rounded-input border border-dashed border-line-3">
                <img src={src} alt={`New image ${i + 1}`} className="absolute inset-0 h-full w-full object-contain p-[8%]" />
              </div>
              <span className="text-[13px] text-ink-3">Uploads on save</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-[13px] text-ink-3">No extra images. The product page shows the main image only.</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={filesId} className="text-[14px] font-semibold">Upload more</label>
        <input
          id={filesId}
          type="file"
          name="galleryFiles"
          multiple
          accept="image/jpeg,image/png,image/webp"
          aria-describedby={hintId}
          onChange={(ev) => {
            const files = [...(ev.currentTarget.files ?? [])];
            setPreviews(files.map((f) => URL.createObjectURL(f)));
          }}
          className="text-[14px] file:mr-3 file:min-h-9 file:cursor-pointer file:rounded-pill file:border file:border-line-3 file:bg-surface file:px-3.5 file:text-[14px] file:font-semibold"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={urlId} className="text-[14px] font-semibold">Or add by URL</label>
        <div className="flex gap-2">
          <input
            id={urlId}
            value={draft}
            onChange={(ev) => setDraft(ev.currentTarget.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                add();
              }
            }}
            placeholder="https://…"
            aria-invalid={draftError ? true : undefined}
            className={cn(fieldClass, 'min-w-0 flex-1', draftError && 'border-bad')}
          />
          <Button type="button" variant="secondary" onClick={add}>Add</Button>
        </div>
        {draftError ? <span className="text-[13px] text-bad">⚠ {draftError}</span> : null}
      </div>

      {error ? (
        <span className="text-[13px] text-bad">⚠ {error}</span>
      ) : (
        <span id={hintId} className="text-[13px] text-ink-3">
          Up to {max} after the main image, shown in this order. JPEG, PNG or WebP, up to 3 MB each.{room < max ? ` ${Math.max(0, room)} left.` : ''}
        </span>
      )}
    </div>
  );
}

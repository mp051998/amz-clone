'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useToast } from '@/components/decision/Toast';

export interface ShareButtonProps {
  title: string;
  /** the product's own page (no decision params), e.g. /in/product/x */
  path: string;
  /** the product photo, for Pinterest */
  image?: string;
}

function ShareIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10V2.5M5 5.25 8 2.25l3 3" />
      <path d="M4.5 7.5h-1v6h9v-6h-1" />
    </svg>
  );
}

/** Where a link can go besides the clipboard. */
export function shareTargets(title: string, url: string, image?: string): { label: string; href: string }[] {
  const e = encodeURIComponent;
  return [
    { label: 'Email', href: `mailto:?subject=${e(title)}&body=${e(`${title}\n${url}`)}` },
    { label: 'WhatsApp', href: `https://wa.me/?text=${e(`${title} ${url}`)}` },
    { label: 'X', href: `https://x.com/intent/post?text=${e(title)}&url=${e(url)}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}` },
    { label: 'Pinterest', href: `https://pinterest.com/pin/create/button/?url=${e(url)}&description=${e(title)}${image ? `&media=${e(image)}` : ''}` },
  ];
}

const touch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

/**
 * "Share" on a product page: the phone's own share sheet on touch devices, otherwise a small panel
 * with the link to copy and the usual places to send it.
 */
export function ShareButton({ title, path, image }: ShareButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(path);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button, a')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const full = () => new URL(path, window.location.origin).href;

  const onShare = async () => {
    if (open) return close();
    const link = full();
    if (touch() && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url: link });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // closed the sheet
      }
    }
    setUrl(link);
    setOpen(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast('Link copied');
    } catch {
      // no clipboard (http, permissions): select the link so it can be copied by hand
      panel.current?.querySelector('input')?.select();
    }
  };

  const absImage = image && typeof window !== 'undefined' ? new URL(image, window.location.origin).href : undefined;

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={onShare}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line-3 bg-surface px-3 text-[13px] font-semibold text-ink hover:border-ink"
      >
        <ShareIcon />
        Share
      </button>
      {open ? (
        <div
          ref={panel}
          id={id}
          role="group"
          aria-label="Share this product"
          className="absolute right-0 top-[calc(100%+6px)] z-40 flex w-[min(320px,calc(100vw-32px))] flex-col gap-3 rounded-card border border-line bg-surface p-3.5 text-ink shadow-hero"
        >
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={url}
              aria-label="Link to this product"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-input border border-line-3 bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] text-ink-2"
            />
            <button type="button" onClick={copy} className="flex-none rounded-input bg-ink px-3 text-[13px] font-semibold text-on-ink">
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {shareTargets(title, url, absImage).map((t) => (
              <li key={t.label}>
                <a
                  href={t.href}
                  {...(t.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={() => close(false)}
                  className="inline-flex min-h-8 items-center rounded-pill border border-line-3 px-3 text-[13px] text-ink no-underline hover:border-ink hover:text-ink"
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

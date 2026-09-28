'use client';
import { useEffect } from 'react';

/** Cookie read by home "Continue shopping": product ids, newest first, comma-separated. */
export const RECENT_COOKIE = 'recent:v1';
export const RECENT_MAX = 12;
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Next list after viewing `id`: newest first, deduped, capped at RECENT_MAX. */
export function nextRecent(current: string | null | undefined, id: string): string[] {
  const prev = (current ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
}

function readCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  if (!hit) return null;
  try { return decodeURIComponent(hit.slice(name.length + 1)); } catch { return null; }
}

/**
 * Records a product view in the `recent:v1` cookie (path '/', 30 days). Pages can't set cookies in
 * Next 16 and a server action would cost a round trip + refresh, so this writes document.cookie.
 */
export function RecordView({ productId }: { productId: string }) {
  useEffect(() => {
    try {
      const ids = nextRecent(readCookie(RECENT_COOKIE), productId);
      document.cookie = `${RECENT_COOKIE}=${encodeURIComponent(ids.join(','))}; path=/; max-age=${MAX_AGE}; samesite=lax`;
    } catch { /* cookies disabled: nothing to remember */ }
  }, [productId]);
  return null;
}

'use client';
import { useEffect } from 'react';
import { nextRecent, RECENT_COOKIE, RECENT_MAX_AGE, RECENT_PAUSED_COOKIE } from '@/lib/recent-ids';

function readCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  if (!hit) return null;
  try { return decodeURIComponent(hit.slice(name.length + 1)); } catch { return null; }
}

/**
 * Records a product view in the `recent:v1` cookie (path '/', 30 days) unless history is paused.
 * Pages can't set cookies in Next 16 and a server action would cost a round trip + refresh, so
 * this writes document.cookie.
 */
export function RecordView({ productId }: { productId: string }) {
  useEffect(() => {
    try {
      if (readCookie(RECENT_PAUSED_COOKIE) === '1') return;
      const ids = nextRecent(readCookie(RECENT_COOKIE), productId);
      document.cookie = `${RECENT_COOKIE}=${encodeURIComponent(ids.join(','))}; path=/; max-age=${RECENT_MAX_AGE}; samesite=lax`;
    } catch { /* cookies disabled: nothing to remember */ }
  }, [productId]);
  return null;
}

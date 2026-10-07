'use client';
import { useEffect } from 'react';
import { nextRecent, parseRecent, RECENT_COOKIE, RECENT_MAX_AGE, RECENT_PAUSED_COOKIE } from '@/lib/recent-ids';

/** How many of the products looked at just before this one the view is counted with. */
const VIEW_PAIRS = 5;

function readCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  if (!hit) return null;
  try { return decodeURIComponent(hit.slice(name.length + 1)); } catch { return null; }
}

/**
 * Records a product view in the `recent:v1` cookie (path '/', 30 days) unless history is paused.
 * Pages can't set cookies in Next 16 and a server action would cost a round trip + refresh, so
 * this writes document.cookie. It also counts the view with the products looked at just before
 * ("Customers who viewed this item also viewed"), except on a reload of the same page.
 */
export function RecordView({ productId }: { productId: string }) {
  useEffect(() => {
    try {
      if (readCookie(RECENT_PAUSED_COOKIE) === '1') return;
      const current = readCookie(RECENT_COOKIE);
      const before = parseRecent(current);
      const ids = nextRecent(current, productId);
      document.cookie = `${RECENT_COOKIE}=${encodeURIComponent(ids.join(','))}; path=/; max-age=${RECENT_MAX_AGE}; samesite=lax`;
      const recent = before.filter((id) => id !== productId).slice(0, VIEW_PAIRS);
      if (before[0] === productId || !recent.length) return;
      void fetch(`/api/v1/products/${encodeURIComponent(productId)}/views`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recent }),
        keepalive: true,
      }).catch(() => { /* only a count: nothing to tell the shopper */ });
    } catch { /* cookies disabled: nothing to remember */ }
  }, [productId]);
  return null;
}

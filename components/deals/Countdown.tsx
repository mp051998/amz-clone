'use client';
import { useEffect, useState } from 'react';
import { clock } from '@/lib/lightning';

/**
 * "Ends in 2:13:45", ticking each second until `to`, then `done`. Only for a real deal's own start
 * or end (design.md §12). The server's render is a second or so off the browser's, hence
 * suppressHydrationWarning; role=timer keeps screen readers from announcing every tick.
 */
export function Countdown({ to, prefix, done }: { to: string; prefix: string; done: string }) {
  const end = Date.parse(to);
  const [now, setNow] = useState(() => Date.now());
  const over = now >= end;
  useEffect(() => {
    if (over) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [over]);
  return (
    <span role="timer" suppressHydrationWarning className="tabular-nums">
      {over ? done : `${prefix}${clock(end - now)}`}
    </span>
  );
}

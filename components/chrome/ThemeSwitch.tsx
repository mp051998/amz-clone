'use client';
import { useState } from 'react';
import { THEME_COOKIE, THEMES, themeAttr, type Theme } from '@/lib/theme';
import { cn } from '../lib/cn';

const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * System / Light / Dark. Applies at once (data-theme on <html>) and remembers the pick for a year
 * in the `theme` cookie, which the root layout reads on the next request. `system` clears both.
 */
export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  const pick = (next: Theme) => {
    setTheme(next);
    const attr = themeAttr(next);
    if (attr) document.documentElement.dataset.theme = attr;
    else delete document.documentElement.dataset.theme;
    document.cookie = attr
      ? `${THEME_COOKIE}=${attr}; path=/; max-age=31536000; samesite=lax`
      : `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  };

  return (
    <div role="group" aria-label="Theme" className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[12px] uppercase tracking-[0.04em] text-ink-3">Theme</span>
      <div className="inline-flex rounded-pill border border-line-3 bg-surface p-0.5">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={theme === t}
            onClick={() => pick(t)}
            className={cn(
              'min-h-9 rounded-pill px-3 text-[13px] font-medium transition-colors',
              theme === t ? 'bg-ink text-on-ink' : 'text-ink-2 hover:text-ink',
            )}
          >
            {LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

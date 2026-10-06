/**
 * Colour theme. `system` (no cookie) follows the OS through prefers-color-scheme; `light` and
 * `dark` are the visitor's pick from the footer, kept in the `theme` cookie so the server
 * renders <html data-theme> and the page never flashes the other theme.
 */
export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
export const THEME_COOKIE = 'theme';

export function themeFrom(value: string | null | undefined): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The `data-theme` attribute for <html>: none for `system`, so the CSS media query decides. */
export function themeAttr(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}

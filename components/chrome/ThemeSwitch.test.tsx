import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { themeAttr, themeFrom } from '@/lib/theme';
import { ThemeSwitch } from './ThemeSwitch';

const pressed = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
  document.cookie = 'theme=; path=/; max-age=0';
});

describe('theme', () => {
  it('reads only light or dark from the cookie; anything else follows the OS', () => {
    expect(themeFrom('dark')).toBe('dark');
    expect(themeFrom('light')).toBe('light');
    expect(themeFrom('sepia')).toBe('system');
    expect(themeFrom(undefined)).toBe('system');
    expect(themeAttr('system')).toBeUndefined();
    expect(themeAttr('dark')).toBe('dark');
  });

  it('applies a pick at once and remembers it; System clears both', () => {
    render(<ThemeSwitch initial="system" />);
    expect(pressed()).toEqual(['System']);

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(pressed()).toEqual(['Dark']);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.cookie).toContain('theme=dark');

    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.cookie).not.toContain('theme=');
  });

  it('starts on the server-read theme', () => {
    render(<ThemeSwitch initial="light" />);
    expect(pressed()).toEqual(['Light']);
  });
});

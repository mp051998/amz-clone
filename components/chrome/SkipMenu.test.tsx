import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { shortcutFor, SkipMenu } from './SkipMenu';

beforeEach(() => {
  push.mockReset();
});
afterEach(cleanup);

const press = (code: string, mods: Partial<KeyboardEventInit> = {}, target: Element | Window = window) =>
  fireEvent.keyDown(target, { code, altKey: true, shiftKey: true, ...mods });

const menu = () => render(<SkipMenu homeHref="/in" cartHref="/in/cart" ordersHref="/in/orders" />);

it('reads Amazon’s shortcuts from the key’s place, whatever option types', () => {
  const k = { key: '', altKey: true, shiftKey: false, ctrlKey: false, metaKey: false };
  expect(shortcutFor({ ...k, code: 'Slash' })).toBe('search');
  expect(shortcutFor({ ...k, shiftKey: true, code: 'KeyC' })).toBe('cart');
  expect(shortcutFor({ ...k, shiftKey: true, code: 'KeyH' })).toBe('home');
  expect(shortcutFor({ ...k, shiftKey: true, code: 'KeyO' })).toBe('orders');
  expect(shortcutFor({ ...k, shiftKey: true, code: 'KeyZ' })).toBe('toggle');
  // without alt, with ctrl or cmd, or another key: nothing
  expect(shortcutFor({ ...k, altKey: false, shiftKey: true, code: 'KeyC' })).toBeNull();
  expect(shortcutFor({ ...k, shiftKey: true, ctrlKey: true, code: 'KeyC' })).toBeNull();
  expect(shortcutFor({ ...k, shiftKey: true, metaKey: true, code: 'KeyC' })).toBeNull();
  expect(shortcutFor({ ...k, code: 'KeyC' })).toBeNull();
  expect(shortcutFor({ ...k, shiftKey: true, code: 'Slash' })).toBeNull();
  // option on a Mac changes `key` ("÷"), so `code` decides; `key` only when `code` is empty
  expect(shortcutFor({ ...k, key: '÷', code: 'Slash' })).toBe('search');
  expect(shortcutFor({ ...k, key: '/', code: '' })).toBe('search');
  expect(shortcutFor({ ...k, shiftKey: true, key: 'C', code: '' })).toBe('cart');
  expect(shortcutFor({ ...k, shiftKey: true, key: 'Ç', code: '' })).toBeNull();
});

it('lists the shortcuts under a link to the main content', () => {
  menu();
  const nav = screen.getByRole('navigation', { name: 'Skip to' });
  expect(screen.getByRole('link', { name: 'Main content' })).toHaveAttribute('href', '#main');
  expect(nav).toHaveTextContent('Search');
  expect(nav).toHaveTextContent('Show/Hide shortcuts');
  expect(nav).toHaveClass('sr-only');
});

it('goes to the cart, home and orders', () => {
  menu();
  press('KeyC');
  press('KeyH');
  press('KeyO');
  expect(push.mock.calls).toEqual([['/in/cart'], ['/in'], ['/in/orders']]);
});

it('leaves text fields alone', () => {
  menu();
  const field = document.createElement('textarea');
  document.body.append(field);
  press('KeyC', {}, field);
  expect(push).not.toHaveBeenCalled();
  field.remove();
});

it('focuses the header search box', () => {
  menu();
  const header = document.createElement('header');
  const box = document.createElement('input');
  box.name = 'k';
  header.append(box);
  document.body.append(header);
  press('Slash', { shiftKey: false });
  expect(box).toHaveFocus();
  header.remove();
});

it('shift + alt + Z keeps the box open until pressed again or Escape', () => {
  menu();
  const nav = screen.getByRole('navigation', { name: 'Skip to' });
  press('KeyZ');
  expect(nav).not.toHaveClass('sr-only');
  press('KeyZ');
  expect(nav).toHaveClass('sr-only');
  press('KeyZ');
  fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
  expect(nav).toHaveClass('sr-only');
});

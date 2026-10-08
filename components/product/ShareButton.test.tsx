import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ShareButton, shareTargets } from './ShareButton';

const writeText = vi.fn(async (_: string) => {});
const share = vi.fn(async (_: ShareData) => {});
let coarse = false;

beforeEach(() => {
  writeText.mockClear();
  share.mockClear();
  coarse = false;
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  window.matchMedia = ((q: string) => ({ matches: q === '(pointer: coarse)' && coarse, media: q })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const button = () => screen.getByRole('button', { name: 'Share' });

it('opens a panel with the product link to copy and places to send it', async () => {
  render(<ShareButton title="Kettle & Co 1.7L" path="/in/product/abc" image="/products/in/zoom/abc.jpg" />);
  fireEvent.click(button());
  expect(button()).toHaveAttribute('aria-expanded', 'true');
  const link = `${window.location.origin}/in/product/abc`;
  expect(screen.getByRole('textbox', { name: 'Link to this product' })).toHaveValue(link);
  expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
  expect(share).not.toHaveBeenCalled(); // not a touch device

  expect(screen.getByRole('link', { name: 'Email' })).not.toHaveAttribute('target');
  expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('target', '_blank');
  expect(screen.getByRole('link', { name: 'Pinterest' }).getAttribute('href')).toContain(`media=${encodeURIComponent(`${window.location.origin}/products/in/zoom/abc.jpg`)}`);

  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
});

it('closes on Escape, back on the button', () => {
  render(<ShareButton title="Kettle" path="/product/abc" />);
  fireEvent.click(button());
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('group', { name: 'Share this product' })).toBeNull();
  expect(button()).toHaveFocus();
  expect(button()).toHaveAttribute('aria-expanded', 'false');
});

it('closes when tapping elsewhere', () => {
  render(<><ShareButton title="Kettle" path="/product/abc" /><p>elsewhere</p></>);
  fireEvent.click(button());
  fireEvent.pointerDown(screen.getByText('elsewhere'));
  expect(screen.queryByRole('group', { name: 'Share this product' })).toBeNull();
});

it("uses the phone's share sheet on touch devices", async () => {
  coarse = true;
  render(<ShareButton title="Kettle" path="/product/abc" />);
  fireEvent.click(button());
  await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Kettle', url: `${window.location.origin}/product/abc` }));
  expect(screen.queryByRole('group', { name: 'Share this product' })).toBeNull();
});

it('shareTargets encodes the title and link', () => {
  const t = Object.fromEntries(shareTargets('A & B', 'https://s.example/product/x').map((x) => [x.label, x.href]));
  expect(t.Email).toBe('mailto:?subject=A%20%26%20B&body=A%20%26%20B%0Ahttps%3A%2F%2Fs.example%2Fproduct%2Fx');
  expect(t.X).toBe('https://x.com/intent/post?text=A%20%26%20B&url=https%3A%2F%2Fs.example%2Fproduct%2Fx');
  expect(t.Facebook).toBe('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fs.example%2Fproduct%2Fx');
  expect(t.Pinterest).not.toContain('media=');
});

it('as a link on a cart line, names the item and opens the same panel', () => {
  render(<ShareButton variant="link" title="Kettle" path="/product/abc" />);
  const link = screen.getByRole('button', { name: 'Share Kettle' });
  expect(link).toHaveTextContent(/^Share$/);
  fireEvent.click(link);
  expect(screen.getByRole('textbox', { name: 'Link to this product' })).toHaveValue(`${window.location.origin}/product/abc`);
});

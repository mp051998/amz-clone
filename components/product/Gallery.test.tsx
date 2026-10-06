import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Gallery } from './Gallery';

afterEach(cleanup);

const IMAGES = ['https://img.test/a.jpg', 'https://img.test/b.jpg', 'https://img.test/c.jpg'];

function openViewer() {
  fireEvent.click(screen.getByRole('button', { name: /open full view/i }));
  return screen.getByRole('dialog', { name: 'Kettle: images' });
}

describe('Gallery', () => {
  it('shows the picked thumbnail in the hero', () => {
    render(<Gallery images={IMAGES} alt="Kettle" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show image 2 of 3' }));
    expect(screen.getByRole('button', { name: 'Show image 2 of 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: 'Kettle, image 2 of 3' })).toHaveAttribute('src', IMAGES[1]);
    expect(screen.getByRole('button', { name: 'Open full view: image 2 of 3' })).toBeInTheDocument();
  });

  it('zooms on hover with the image under the pointer, and drops the lens on leave', () => {
    render(<Gallery images={IMAGES} alt="Kettle" />);
    const hero = screen.getByRole('button', { name: /open full view/i });
    hero.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} });
    fireEvent.mouseMove(hero, { clientX: 50, clientY: 150 });
    const lens = screen.getByTestId('zoom-lens').querySelector('img') as HTMLImageElement;
    expect(lens).toHaveAttribute('src', IMAGES[0]);
    expect(lens.style.transform).toBe('scale(2.5)');
    expect(lens.style.transformOrigin).toBe('25% 75%');
    fireEvent.mouseLeave(hero);
    expect(screen.queryByTestId('zoom-lens')).toBeNull();
  });

  it('opens the full view on the current image and steps through, wrapping round', () => {
    render(<Gallery images={IMAGES} alt="Kettle" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show image 3 of 3' }));
    const dialog = openViewer();
    expect(within(dialog).getByRole('img', { name: 'Kettle, image 3 of 3' })).toHaveAttribute('src', IMAGES[2]);
    expect(within(dialog).getByText('Image 3 of 3')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next image' }));
    expect(within(dialog).getByRole('img', { name: 'Kettle, image 1 of 3' })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(within(dialog).getByRole('img', { name: 'Kettle, image 3 of 3' })).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(within(dialog).getByRole('img', { name: 'Kettle, image 2 of 3' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show image 1 of 3' }));
    expect(within(dialog).getByRole('button', { name: 'Show image 1 of 3' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes on Escape, returns focus to the hero and keeps the image the viewer ended on', () => {
    render(<Gallery images={IMAGES} alt="Kettle" />);
    const dialog = openViewer();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    const hero = screen.getByRole('button', { name: 'Open full view: image 2 of 3' });
    expect(hero).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Show image 2 of 3' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('zooms in the viewer; Escape zooms out before it closes', () => {
    render(<Gallery images={IMAGES} alt="Kettle" />);
    const dialog = openViewer();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }));
    expect(within(dialog).getByRole('button', { name: 'Zoom out', pressed: true })).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Kettle, image 1 of 3' }).style.transform).toBe('scale(2.5)');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Kettle, image 1 of 3' }).style.transform).toBe('');
    // stepping to another image resets the zoom
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next image' }));
    expect(within(dialog).getByRole('img', { name: 'Kettle, image 2 of 3' }).style.transform).toBe('');
  });

  it('clicking the image zooms on that spot; a swipe flips images', () => {
    render(<Gallery images={IMAGES} alt="Kettle" />);
    const dialog = openViewer();
    const stage = within(dialog).getByTestId('viewer-stage');
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} });
    fireEvent.click(stage, { clientX: 100, clientY: 300 });
    const img = within(dialog).getByRole('img', { name: 'Kettle, image 1 of 3' });
    expect(img.style.transform).toBe('scale(2.5)');
    expect(img.style.transformOrigin).toBe('25% 75%');
    fireEvent.click(stage, { clientX: 100, clientY: 300 });
    expect(img.style.transform).toBe('');
    // the dialog takes focus from a click on the image, so the keys keep working
    expect(dialog).toHaveAttribute('tabindex', '-1');

    fireEvent.pointerDown(stage, { pointerType: 'touch', clientX: 300, clientY: 200 });
    fireEvent.pointerUp(stage, { pointerType: 'touch', clientX: 200, clientY: 210 });
    expect(within(dialog).getByRole('img', { name: 'Kettle, image 2 of 3' })).toBeInTheDocument();
    fireEvent.pointerDown(stage, { pointerType: 'touch', clientX: 100, clientY: 200 });
    fireEvent.pointerUp(stage, { pointerType: 'touch', clientX: 120, clientY: 200 });
    expect(within(dialog).getByRole('img', { name: 'Kettle, image 2 of 3' })).toBeInTheDocument();
  });

  it('keeps Tab inside the viewer', () => {
    render(<Gallery images={IMAGES} alt="Kettle" />);
    const dialog = openViewer();
    const buttons = within(dialog).getAllByRole('button');
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(buttons[0]).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(buttons[buttons.length - 1]).toHaveFocus();
  });

  it('a single image has no thumbnails or arrows', () => {
    render(<Gallery images={[IMAGES[0]]} alt="Kettle" />);
    expect(screen.queryByRole('group', { name: 'Product images' })).toBeNull();
    const dialog = openViewer();
    expect(within(dialog).queryByRole('button', { name: 'Next image' })).toBeNull();
    expect(within(dialog).getByRole('img', { name: 'Kettle' })).toHaveAttribute('src', IMAGES[0]);
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByRole('img', { name: 'Kettle' })).toBeInTheDocument();
  });

  it('zooms into the large copy of a seeded image, falling back to the image if it fails', () => {
    render(<Gallery images={['/products/6181VJVcgSL.jpg']} alt="Kettle" />);
    const dialog = openViewer();
    const img = within(dialog).getByRole('img', { name: 'Kettle' });
    expect(img).toHaveAttribute('src', '/products/zoom/6181VJVcgSL.jpg');
    fireEvent.error(img);
    expect(within(dialog).getByRole('img', { name: 'Kettle' })).toHaveAttribute('src', '/products/6181VJVcgSL.jpg');
  });

  it('with no image shows the placeholder and nothing to open', () => {
    render(<Gallery images={[]} alt="Kettle" />);
    expect(screen.getByText('product shot')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open full view/i })).toBeNull();
  });
});

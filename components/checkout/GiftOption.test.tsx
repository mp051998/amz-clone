import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GiftOption } from './GiftOption';

afterEach(cleanup);

it('asks for a note only once the order is marked as a gift', () => {
  const { container } = render(<form><GiftOption max={240} /></form>);
  expect(screen.queryByLabelText('Gift message (optional)')).toBeNull();

  fireEvent.click(screen.getByLabelText('This order contains a gift'));
  const note = screen.getByLabelText('Gift message (optional)');
  expect(note).toHaveAttribute('maxlength', '240');
  fireEvent.change(note, { target: { value: 'Enjoy!' } });
  expect(screen.getByText(/234 characters left/)).toBeInTheDocument();

  const form = new FormData(container.querySelector('form')!);
  expect(form.get('gift')).toBe('on');
  expect(form.get('giftMessage')).toBe('Enjoy!');
});

it('an unticked box sends nothing', () => {
  const { container } = render(<form><GiftOption max={240} /></form>);
  const form = new FormData(container.querySelector('form')!);
  expect(form.get('gift')).toBeNull();
  expect(form.get('giftMessage')).toBeNull();
});

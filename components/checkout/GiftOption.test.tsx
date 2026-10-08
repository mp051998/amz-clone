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

it('offers gift wrap with its fee when the store wraps, sent only for a gift', () => {
  const { container, rerender } = render(<form><GiftOption max={240} /></form>);
  fireEvent.click(screen.getByLabelText('This order contains a gift'));
  expect(screen.queryByLabelText(/Gift-wrap/)).toBeNull();

  rerender(<form><GiftOption max={240} wrapFee="$3.99" /></form>);
  const wrap = screen.getByLabelText('Gift-wrap the items ($3.99 per item)');
  expect(wrap).toHaveAttribute('id', 'gift-wrap');
  fireEvent.click(wrap);
  expect(new FormData(container.querySelector('form')!).get('giftWrap')).toBe('on');

  fireEvent.click(screen.getByLabelText('This order contains a gift'));
  expect(new FormData(container.querySelector('form')!).get('giftWrap')).toBeNull();
});

it('starts ticked when the cart said the order contains a gift', () => {
  const { container } = render(<form><GiftOption max={240} initial /></form>);
  expect(screen.getByLabelText('This order contains a gift')).toBeChecked();
  expect(screen.getByLabelText('Gift message (optional)')).toBeInTheDocument();
  expect(new FormData(container.querySelector('form')!).get('gift')).toBe('on');
  // and can still be unticked
  fireEvent.click(screen.getByLabelText('This order contains a gift'));
  expect(screen.queryByLabelText('Gift message (optional)')).toBeNull();
});

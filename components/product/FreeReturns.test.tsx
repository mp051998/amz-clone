import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { FreeReturns } from './FreeReturns';

afterEach(cleanup);

it('opens a note on returning the item for free within its window', () => {
  render(<FreeReturns days={30} />);
  expect(screen.getByRole('button', { name: 'FREE Returns' })).toHaveAttribute('popovertarget', 'free-returns');
  const note = document.getElementById('free-returns')!;
  expect(note).toHaveAttribute('popover', 'auto');
  expect(note).toHaveAttribute('aria-label', 'Return this item for free');
  expect(note).toHaveTextContent('Return it within 30 days of delivery for a full refund.');
  expect(note).toHaveTextContent('print the prepaid label');
});

it('gives the holiday return-by date when it is later', () => {
  render(<FreeReturns days={30} until="January 31, 2027" />);
  expect(document.getElementById('free-returns')).toHaveTextContent('Return it by January 31, 2027 (holiday returns) for a full refund.');
});

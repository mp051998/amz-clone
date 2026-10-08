import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { amazon } from '@/lib/amazon';
import { amazonIn } from '@/lib/marketplace-in';
import { LastPurchased } from './LastPurchased';

afterEach(cleanup);

it('gives the date it was last bought, with its year, and links the order', () => {
  render(<LastPurchased last={{ orderId: '114-1', at: '2026-09-03T18:00:00Z' }} orderHref="/orders/114-1?placed=0" store={amazon} />);
  const note = screen.getByRole('note', { name: 'Your last purchase' });
  expect(note.textContent).toBe('You last purchased this item on September 3, 2026.View this order');
  expect(screen.getByRole('link', { name: 'View this order' })).toHaveAttribute('href', '/orders/114-1?placed=0');
});

it('words the date the store’s way, on its own clock', () => {
  // 11:30 PM in New York on the 3rd is the 4th in India
  render(<LastPurchased last={{ orderId: '404-1', at: '2026-09-04T03:30:00Z' }} orderHref="/in/orders/404-1?placed=0" store={amazonIn} />);
  expect(screen.getByRole('note').textContent).toContain('You last purchased this item on 4 September 2026.');
});

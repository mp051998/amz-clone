import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('@/app/actions/deals', () => ({ toggleWatchDeal: vi.fn() }));

import { WatchDeal } from './WatchDeal';

afterEach(() => {
  cleanup();
  push.mockReset();
});

it('watches an upcoming deal, and stops', async () => {
  const action = vi.fn(async (_id: string, watch: boolean) => ({ watching: watch }));
  render(<WatchDeal dealId="d1" watching={false} name="Desk Lamp" action={action} market="US" />);
  fireEvent.click(screen.getByRole('button', { name: 'Watch deal on Desk Lamp' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Watching deal on Desk Lamp' })).not.toBeDisabled());
  expect(screen.getByRole('button', { name: 'Watching deal on Desk Lamp' })).toHaveAttribute('aria-pressed', 'true');
  expect(action).toHaveBeenLastCalledWith('d1', true);

  fireEvent.click(screen.getByRole('button', { name: 'Watching deal on Desk Lamp' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Watch deal on Desk Lamp' })).not.toBeDisabled());
  expect(screen.getByRole('button', { name: 'Watch deal on Desk Lamp' })).toHaveAttribute('aria-pressed', 'false');
  expect(action).toHaveBeenLastCalledWith('d1', false);
});

it('sends guests to sign in, and goes back when the deal has started', async () => {
  render(<WatchDeal dealId="d1" watching={false} action={async () => ({ error: 'not_authenticated' })} market="IN" />);
  fireEvent.click(screen.getByRole('button', { name: 'Watch this deal' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/in\/signin\?next=/)));
  expect(screen.getByRole('button', { name: 'Watch this deal' })).toHaveAttribute('aria-pressed', 'false');
  cleanup();
  push.mockClear();

  render(<WatchDeal dealId="d1" watching={false} action={async () => ({ error: 'deal_not_upcoming', message: 'Started' })} market="US" />);
  fireEvent.click(screen.getByRole('button', { name: 'Watch this deal' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Watch this deal' })).not.toBeDisabled());
  expect(screen.getByRole('button', { name: 'Watch this deal' })).toHaveAttribute('aria-pressed', 'false');
  expect(push).not.toHaveBeenCalled();
});

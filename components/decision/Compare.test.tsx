import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { CompareProvider, CompareToggle, CompareTray, compareStorageKey } from './Compare';
import { ToastProvider } from './Toast';

const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `Product ${id.toUpperCase()}` }));

function Harness({ market = 'IN' as const }: { market?: 'US' | 'IN' }) {
  return (
    <ToastProvider>
      <CompareProvider market={market}>
        {items.map((i) => <CompareToggle key={i.id} item={i} />)}
        <CompareTray />
      </CompareProvider>
    </ToastProvider>
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

it('adds items to the tray, links to a store-prefixed compare, and caps at 4 with a toast', () => {
  render(<Harness />);
  expect(screen.queryByRole('region', { name: 'Compare tray' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Product A' }));
  expect(screen.getByText('Compare 1 product')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add 1 more' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Product B' }));
  expect(screen.getByRole('link', { name: 'Compare 2 →' })).toHaveAttribute('href', '/in/compare?ids=a,b');
  expect(screen.getByRole('checkbox', { name: 'Compare Product A' })).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Product C' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Product D' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Product E' }));
  expect(screen.getByRole('checkbox', { name: 'Compare Product E' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('status')).toHaveTextContent('You can compare up to 4 products');

  expect(JSON.parse(window.localStorage.getItem(compareStorageKey('IN')) ?? '[]')).toHaveLength(4);

  fireEvent.click(screen.getByRole('button', { name: 'Remove Product A from compare' }));
  expect(screen.getByText('Compare 3 products')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByRole('region', { name: 'Compare tray' })).not.toBeInTheDocument();
});

it('hydrates from localStorage per market', async () => {
  window.localStorage.setItem(compareStorageKey('US'), JSON.stringify([items[0], items[1]]));
  await act(async () => { render(<Harness market="US" />); });
  expect(screen.getByRole('link', { name: 'Compare 2 →' })).toHaveAttribute('href', '/compare?ids=a,b');
});

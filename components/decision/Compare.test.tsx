import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CompareProvider, CompareToggle, CompareTray, categoryConflict, compareStorageKey, type CompareItem } from './Compare';
import { ToastProvider } from './Toast';

const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `Product ${id.toUpperCase()}` }));

function Harness({ market = 'IN' as const, list = items }: { market?: 'US' | 'IN'; list?: CompareItem[] }) {
  return (
    <ToastProvider>
      <CompareProvider market={market}>
        {list.map((i) => <CompareToggle key={i.id} item={i} />)}
        <CompareTray />
      </CompareProvider>
    </ToastProvider>
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); });

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

const phone = (id: string): CompareItem => ({ id, name: `Phone ${id}`, category: 'mobiles', categoryName: 'Mobiles' });
const book = (id: string): CompareItem => ({ id, name: `Book ${id}`, category: 'books', categoryName: 'Books' });
const stored = () => (JSON.parse(window.localStorage.getItem(compareStorageKey('IN')) ?? '[]') as CompareItem[]).map((i) => i.id);

it('flags a product from a category the tray does not have', () => {
  expect(categoryConflict([phone('p1')], [phone('p2')])).toBeNull();
  expect(categoryConflict([], [book('b1')])).toBeNull();
  // items saved before categories were tracked never conflict
  expect(categoryConflict([{ id: 'x', name: 'Old' }], [book('b1')])).toBeNull();
  expect(categoryConflict([phone('p1'), { id: 'x', name: 'Old' }], [book('b1')])).toEqual({
    items: [book('b1')], incoming: 'Books', inTray: ['Mobiles'],
  });
});

describe('cross-category prompt', () => {
  const list = [phone('p1'), phone('p2'), book('b1')];
  const open = () => {
    render(<Harness list={list} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Phone p1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Phone p2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Book b1' }));
    return screen.getByRole('alertdialog', { name: 'Different category' });
  };

  it('holds the product back and explains why', () => {
    const dialog = open();
    expect(dialog).toHaveTextContent('Book b1 is in Books. Your compare tray has Mobiles.');
    expect(dialog).toHaveFocus();
    expect(screen.getByRole('checkbox', { name: 'Compare Book b1' })).toHaveAttribute('aria-checked', 'false');
    expect(stored()).toEqual(['p1', 'p2']);
  });

  it('starts a new comparison with just that product', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Start new comparison' }));
    expect(stored()).toEqual(['b1']);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('adds it anyway when the shopper insists', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
    expect(stored()).toEqual(['p1', 'p2', 'b1']);
    expect(screen.getByRole('link', { name: 'Compare 3 →' })).toHaveAttribute('href', '/in/compare?ids=p1,p2,b1');
  });

  it('cancels with the button or Escape', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Book b1' }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(stored()).toEqual(['p1', 'p2']);
  });
});

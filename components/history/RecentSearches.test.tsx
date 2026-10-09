import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { addRecentSearch, readRecentSearches } from '@/lib/recent-searches';
import { RecentSearches } from './RecentSearches';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it('lists the store’s recent searches to run again, remove or clear', () => {
  addRecentSearch('IN', 'saree');
  addRecentSearch('IN', 'cotton kurta');
  addRecentSearch('US', 'kettle');
  render(<RecentSearches market="IN" searchPath="/in/s" />);
  expect(screen.getByRole('heading', { name: 'Your recent searches' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'cotton kurta' })).toHaveAttribute('href', '/in/s?k=cotton+kurta');
  expect(screen.queryByRole('link', { name: 'kettle' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Remove saree from recent searches' }));
  expect(screen.queryByRole('link', { name: 'saree' })).toBeNull();
  expect(readRecentSearches('IN')).toEqual(['cotton kurta']);

  fireEvent.click(screen.getByRole('button', { name: 'Clear searches' }));
  expect(screen.queryByRole('heading', { name: 'Your recent searches' })).toBeNull();
  expect(readRecentSearches('IN')).toEqual([]);
  expect(readRecentSearches('US')).toEqual(['kettle']);
});

it('shows nothing without any', () => {
  const { container } = render(<RecentSearches market="US" searchPath="/s" />);
  expect(container).toBeEmptyDOMElement();
});

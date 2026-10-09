import { beforeEach, expect, it } from 'vitest';
import { addRecentSearch, cleanSearch, matchingRecentSearches, readRecentSearches, RECENT_SEARCHES_MAX, removeRecentSearch } from './recent-searches';

beforeEach(() => localStorage.clear());

it('keeps searches newest first, once each whatever the case, per store', () => {
  addRecentSearch('US', 'kettle');
  addRecentSearch('US', '  Sony   headphones ');
  addRecentSearch('US', 'KETTLE');
  addRecentSearch('IN', 'saree');
  expect(readRecentSearches('US')).toEqual(['KETTLE', 'Sony headphones']);
  expect(readRecentSearches('IN')).toEqual(['saree']);
});

it('ignores blank searches and keeps only the newest few', () => {
  addRecentSearch('US', '   ');
  expect(readRecentSearches('US')).toEqual([]);
  for (let i = 0; i < RECENT_SEARCHES_MAX + 3; i++) addRecentSearch('US', `item ${i}`);
  const list = readRecentSearches('US');
  expect(list).toHaveLength(RECENT_SEARCHES_MAX);
  expect(list[0]).toBe(`item ${RECENT_SEARCHES_MAX + 2}`);
});

it('removes one search', () => {
  addRecentSearch('US', 'kettle');
  addRecentSearch('US', 'mug');
  expect(removeRecentSearch('US', 'Kettle')).toEqual(['mug']);
  expect(removeRecentSearch('US', 'mug')).toEqual([]);
  expect(localStorage.getItem('search:recent:v1:US')).toBeNull();
});

it('survives garbled storage', () => {
  localStorage.setItem('search:recent:v1:US', '{nope');
  expect(readRecentSearches('US')).toEqual([]);
  localStorage.setItem('search:recent:v1:US', JSON.stringify(['ok', 3, '', 'OK', null]));
  expect(readRecentSearches('US')).toEqual(['ok']);
});

it('matches what is typed by its start, leaving out the same search', () => {
  const list = ['sony headphones', 'Sony speaker', 'kettle', 'sony'];
  expect(matchingRecentSearches(list, 'son', 3)).toEqual(['sony headphones', 'Sony speaker', 'sony']);
  expect(matchingRecentSearches(list, 'SONY', 3)).toEqual(['sony headphones', 'Sony speaker']);
  expect(matchingRecentSearches(list, '', 2)).toEqual(['sony headphones', 'Sony speaker']);
  expect(cleanSearch('a'.repeat(150))).toHaveLength(100);
});

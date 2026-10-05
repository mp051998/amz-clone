import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Suggestions } from '@/lib/search';
import { SearchBar } from './SearchBar';

const answer: Suggestions = {
  total: 3,
  terms: [{ text: 'sony headphones', count: 2 }],
  departments: [{ slug: 'electronics', name: 'Electronics', count: 2 }],
  products: [{ id: '41lArSiD5hL', title: 'Sony WH-CH520', image: '/products/41lArSiD5hL.jpg' }],
};
const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ market: 'IN', q: 'x', ...answer })));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const box = () => screen.getByRole('combobox', { name: 'Search' });

it('suggests completions, departments and products for the store', async () => {
  render(<SearchBar actionPath="/in/s" />);
  fireEvent.focus(box());
  fireEvent.change(box(), { target: { value: 's' } });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument(); // one letter isn't enough

  fireEvent.change(box(), { target: { value: 'sony he' } });
  const term = await screen.findByRole('option', { name: 'sony headphones' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/suggest?market=IN&q=sony%20he');
  expect(term).toHaveAttribute('data-href', '/in/s?k=sony+headphones');
  expect(screen.getByRole('option', { name: 'sony headphones in Electronics' })).toHaveAttribute('data-href', '/in/s?k=sony+headphones&dept=electronics');
  expect(screen.getByRole('option', { name: 'Sony WH-CH520' })).toHaveAttribute('data-href', '/in/product/41lArSiD5hL');
  expect(box()).toHaveAttribute('aria-expanded', 'true');
});

it('moves through the options with the arrow keys and closes on Escape', async () => {
  render(<SearchBar actionPath="/s" market="US" />);
  fireEvent.focus(box());
  fireEvent.change(box(), { target: { value: 'sony he' } });
  await screen.findByRole('option', { name: 'sony headphones' });
  expect(fetchMock.mock.calls[0][0]).toContain('market=US');

  fireEvent.keyDown(box(), { key: 'ArrowDown' });
  fireEvent.keyDown(box(), { key: 'ArrowDown' });
  const selected = screen.getByRole('option', { selected: true });
  expect(selected).toHaveAccessibleName('sony headphones in Electronics');
  expect(box()).toHaveAttribute('aria-activedescendant', selected.id);
  fireEvent.keyDown(box(), { key: 'ArrowUp' });
  fireEvent.keyDown(box(), { key: 'ArrowUp' });
  expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('Sony WH-CH520'); // wraps

  fireEvent.keyDown(box(), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(box()).toHaveAttribute('aria-expanded', 'false');
  expect(box()).not.toHaveAttribute('aria-activedescendant');
});

it('offers the department itself when only its name matched', async () => {
  fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ ...answer, terms: [], products: [] })));
  render(<SearchBar actionPath="/s" />);
  fireEvent.focus(box());
  fireEvent.change(box(), { target: { value: 'electro' } });
  expect(await screen.findByRole('option', { name: 'Electronics department' })).toHaveAttribute('data-href', '/s?dept=electronics');
});

it('keeps the plain search working when suggestions fail', async () => {
  fetchMock.mockImplementationOnce(async () => new Response('nope', { status: 500 }));
  render(<SearchBar actionPath="/s" defaultQuery="kettle" />);
  fireEvent.focus(box());
  fireEvent.change(box(), { target: { value: 'kettles' } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(box()).toHaveValue('kettles');
  expect(box().closest('form')).toHaveAttribute('action', '/s');
});

it('works as the home hero box under its own name', async () => {
  render(<SearchBar size="hero" actionPath="/in/s" market="IN" label="Search for products, brands, or describe what you need" />);
  const hero = screen.getByRole('combobox', { name: 'Search for products, brands, or describe what you need' });
  fireEvent.focus(hero);
  fireEvent.change(hero, { target: { value: 'sony he' } });
  expect(await screen.findByRole('option', { name: 'Sony WH-CH520' })).toHaveAttribute('data-href', '/in/product/41lArSiD5hL');
  expect(hero.closest('form')).toHaveClass('rounded-panel', 'shadow-hero');
});

it('shows the search being looked at, and only suggests once the box is used', async () => {
  render(<SearchBar actionPath="/s" defaultQuery="wireless headphones" />);
  expect(box()).toHaveValue('wireless headphones');
  await new Promise((r) => setTimeout(r, 200));
  expect(fetchMock).not.toHaveBeenCalled();

  fireEvent.focus(box());
  expect(await screen.findByRole('option', { name: 'sony headphones' })).toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/suggest?market=US&q=wireless%20headphones');
});

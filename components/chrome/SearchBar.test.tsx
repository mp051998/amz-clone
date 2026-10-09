import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addRecentSearch, readRecentSearches } from '@/lib/recent-searches';
import type { Suggestions } from '@/lib/search';
import { SearchBar } from './SearchBar';

const lookAtImage = vi.fn();
vi.mock('@/app/actions/lens', () => ({ lookAtImage: (...a: unknown[]) => lookAtImage(...a) }));
const shrinkPhoto = vi.fn();
vi.mock('./shrink-photo', () => ({ shrinkPhoto: (...a: unknown[]) => shrinkPhoto(...a) }));

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
  localStorage.clear();
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

describe('recent searches', () => {
  it('offers them, newest first, when the box is empty, and removes one', () => {
    addRecentSearch('US', 'kettle');
    addRecentSearch('US', 'sony headphones');
    addRecentSearch('IN', 'saree');
    render(<SearchBar actionPath="/s" market="US" />);
    fireEvent.focus(box());
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['Recent search: sony headphones', 'Recent search: kettle']);
    expect(options[0]).toHaveAttribute('data-href', '/s?k=sony+headphones');
    expect(screen.getByText('Recent searches')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(within(options[1]).getByRole('button', { hidden: true, name: 'Remove' }));
    expect(screen.queryByRole('option', { name: 'Recent search: kettle' })).toBeNull();
    expect(readRecentSearches('US')).toEqual(['sony headphones']);

    // from the keyboard: pick it, then Delete
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'Delete' });
    expect(readRecentSearches('US')).toEqual([]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(readRecentSearches('IN')).toEqual(['saree']);
  });

  it('reads them again on focus, so two boxes on a page agree', () => {
    addRecentSearch('US', 'kettle');
    render(<SearchBar actionPath="/s" market="US" />);
    addRecentSearch('US', 'mug'); // from the other box
    fireEvent.focus(box());
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Recent search: mug', 'Recent search: kettle']);
  });

  it('puts the ones that start with what is typed above the suggestions', async () => {
    addRecentSearch('US', 'kettle');
    addRecentSearch('US', 'sony headphones');
    render(<SearchBar actionPath="/s" market="US" />);
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: 'sony he' } });
    await screen.findByRole('option', { name: 'sony headphones in Electronics' });
    const names = screen.getAllByRole('option').map((o) => o.getAttribute('aria-label') ?? o.textContent);
    // the completion it repeats isn't offered twice
    expect(names).toEqual(['Recent search: sony headphones', 'sony headphones in Electronics', 'Sony WH-CH520']);
  });

  it('remembers the search a results page shows, unless browsing history is paused', () => {
    render(<SearchBar actionPath="/s" market="US" defaultQuery="  Wireless   mouse " />);
    expect(readRecentSearches('US')).toEqual(['Wireless mouse']);
    cleanup();
    document.cookie = 'recent:off=1; path=/';
    try {
      render(<SearchBar actionPath="/s" market="US" defaultQuery="kettle" />);
      expect(readRecentSearches('US')).toEqual(['Wireless mouse']);
    } finally {
      document.cookie = 'recent:off=; path=/; max-age=0';
    }
  });
});

describe('search by image', () => {
  const assign = vi.fn();
  const realLocation = window.location;
  beforeEach(() => {
    lookAtImage.mockReset();
    shrinkPhoto.mockReset();
    assign.mockReset();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, assign } });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  const pick = (name = 'shoes.jpg') => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'image/jpeg' })] } });
  };

  it('opens a photo picker from the camera, then searches for what’s in the photo', async () => {
    shrinkPhoto.mockResolvedValue('data:image/jpeg;base64,/9j/AAAA');
    lookAtImage.mockResolvedValue({ ok: true, result: { query: 'red running shoes', source: 'ai' } });
    render(<SearchBar actionPath="/in/s" />);
    const camera = screen.getByRole('button', { name: 'Search by image' });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(camera);
    expect(click).toHaveBeenCalled();
    expect(input).toHaveAttribute('accept', 'image/*');

    pick('red-shoes.jpg');
    expect(await screen.findByRole('status')).toHaveTextContent('Looking at your photo');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/in/s?k=red+running+shoes&lens=1'));
    expect(lookAtImage).toHaveBeenCalledWith({ image: 'data:image/jpeg;base64,/9j/AAAA', name: 'red-shoes.jpg' });
  });

  it('says so when nothing in the photo can be named, or it can’t be opened', async () => {
    shrinkPhoto.mockResolvedValue('data:image/jpeg;base64,/9j/AAAA');
    lookAtImage.mockResolvedValue({ ok: true, result: { query: null, source: 'rules' } });
    render(<SearchBar />);
    pick();
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t tell what’s in that photo');
    expect(assign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    shrinkPhoto.mockResolvedValue(null);
    pick('photo.heic');
    expect(await screen.findByRole('alert')).toHaveTextContent('That photo couldn’t be opened');
    expect(lookAtImage).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from 'vitest';
import { buildVocab, correctQuery, correctWord, editDistance, isKnown } from './spell';

const vocab = buildVocab([
  'Hybrid Active Noise Cancelling Bluetooth Headphones, Over Ear',
  'Wireless Earbuds with Charging Case',
  'Sony WH-1000XM5 Wireless Headphones',
  'Stainless Steel Electric Kettle 1.7L',
  'Non-stick Cookware Set',
  'Running Shoes for Men',
  'Electronics',
  'Home & Kitchen',
  null,
]);

describe('editDistance', () => {
  it('counts inserts, deletes, substitutions and neighbour swaps as one edit each', () => {
    expect(editDistance('kettle', 'kettle')).toBe(0);
    expect(editDistance('ketle', 'kettle')).toBe(1);
    expect(editDistance('kettlle', 'kettle')).toBe(1);
    expect(editDistance('kittle', 'kettle')).toBe(1);
    expect(editDistance('ketlte', 'kettle')).toBe(1);
    expect(editDistance('abc', 'xyz')).toBe(3);
  });

  it('stops early past the limit', () => {
    expect(editDistance('a', 'abcdef', 2)).toBe(3);
    expect(editDistance('headphones', 'kettle', 2)).toBe(3);
  });
});

describe('correctWord', () => {
  it('leaves words search already matches, including the start of a word', () => {
    expect(isKnown('headph', vocab)).toBe(true);
    expect(correctWord('headphones', vocab)).toBeNull();
    expect(correctWord('headph', vocab)).toBeNull();
    expect(correctWord('Kettle', vocab)).toBeNull();
  });

  it('fixes a typo to the closest catalog word', () => {
    expect(correctWord('hedphones', vocab)).toBe('headphones');
    expect(correctWord('haedphones', vocab)).toBe('headphones');
    expect(correctWord('ketle', vocab)).toBe('kettle');
    expect(correctWord('wirless', vocab)).toBe('wireless');
    expect(correctWord('earbudz', vocab)).toBe('earbuds');
    expect(correctWord('Blutooth', vocab)).toBe('bluetooth');
  });

  it('fixes a misspelt start of a word', () => {
    expect(correctWord('hedpho', vocab)).toBe('headphones');
  });

  it('allows two edits only in longer words', () => {
    expect(correctWord('heaphonse', vocab)).toBe('headphones');
    expect(correctWord('kitlte', vocab)).toBeNull();
  });

  it('leaves short words, model numbers and the hopeless alone', () => {
    expect(correctWord('sny', vocab)).toBeNull();
    expect(correctWord('xm6', vocab)).toBeNull();
    expect(correctWord('1000xm6', vocab)).toBeNull();
    expect(correctWord('trampoline', vocab)).toBeNull();
  });
});

describe('correctQuery', () => {
  it('corrects the keywords and swaps the same words in the query as typed', () => {
    expect(correctQuery('Hedphones under $50', 'hedphones', vocab)).toEqual({ query: 'headphones under $50', keywords: 'headphones' });
    expect(correctQuery('wirless  earbudz for running', 'wirless earbudz', vocab)).toEqual({ query: 'wireless  earbuds for running', keywords: 'wireless earbuds' });
  });

  it('only touches keyword words, not the rest of the query', () => {
    expect(correctQuery('kettle for my mum', 'kettle', vocab)).toBeNull();
    expect(correctQuery('ketle for my mumm', 'ketle', vocab)).toEqual({ query: 'kettle for my mumm', keywords: 'kettle' });
  });

  it('is null when there is nothing to correct', () => {
    expect(correctQuery('noise cancelling headphones', 'noise cancelling headphones', vocab)).toBeNull();
    expect(correctQuery('trampoline', 'trampoline', vocab)).toBeNull();
    expect(correctQuery('', '', vocab)).toBeNull();
  });
});

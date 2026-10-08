import { describe, expect, it } from 'vitest';
import { askSuggestions, askTerms, matchParts, productPassages, rankPassages, readAskQuestion, sentences, stem, type AskSources } from './product-ask';

describe('readAskQuestion', () => {
  it('tidies spaces and keeps 3–150 characters', () => {
    expect(readAskQuestion('  is it   loud? ')).toBe('is it loud?');
    expect(readAskQuestion('ok')).toBeNull();
    expect(readAskQuestion('x'.repeat(151))).toBeNull();
    expect(readAskQuestion(42)).toBeNull();
  });
});

describe('stem / askTerms', () => {
  it('cuts common endings', () => {
    expect(stem('batteries')).toBe('battery');
    expect(stem('charging')).toBe('charg');
    expect(stem('boxes')).toBe('box');
    expect(stem('sizes')).toBe('size');
    expect(stem('glass')).toBe('glass');
    expect(stem('it’s')).toBe('it');
  });

  it('drops filler words and repeats, keeps short numbers', () => {
    expect(askTerms('How long does the battery last? Does the battery charge fast?')).toEqual(['battery', 'last', 'charge', 'fast']);
    expect(askTerms('Does it support 5G and 4k?')).toEqual(['support', '5g', '4k']);
    expect(askTerms('Is it any good?')).toEqual(['good']);
    expect(askTerms('is it?')).toEqual([]);
  });
});

describe('sentences', () => {
  it('splits on sentence ends and lines, dropping one-word bits', () => {
    expect(sentences('Great sound. The battery lasts 30 hours!\nCase is 3.5 in. wide\nOk')).toEqual([
      'Great sound.',
      'The battery lasts 30 hours!',
      'Case is 3.5 in. wide',
    ]);
  });
});

const src: AskSources = {
  bullets: ['Up to 30 hours of battery life with quick charging', 'Industry-leading noise cancellation'],
  details: [['Weight', '250 g'], ['Connectivity', 'Bluetooth 5.3']],
  description: 'Wireless over-ear headphones. Folds flat into the carry case.',
  questions: [
    { id: 'q1', body: 'Does the battery really last 30 hours?', answers: [{ body: 'Closer to 26 with noise cancelling on.' }, { body: 'Yes for me.' }] },
    { id: 'q2', body: 'Do they fold?', answers: [{ body: 'They fold flat.' }] },
  ],
  reviews: [
    { rating: 5, title: 'Battery for days', body: 'I charge them once a week. Sound is warm.' },
    { rating: 2, title: 'Tight fit', body: 'They squeeze my head. The battery is fine though.' },
    { rating: 4, title: 'Good', body: 'Comfortable on long flights.' },
  ],
};

describe('productPassages', () => {
  it('turns details, answered questions and review sentences into passages', () => {
    const ps = productPassages(src);
    expect(ps.filter((p) => p.kind === 'details').map((p) => p.text)).toEqual([
      'Up to 30 hours of battery life with quick charging',
      'Industry-leading noise cancellation',
      'Weight: 250 g',
      'Connectivity: Bluetooth 5.3',
      'Wireless over-ear headphones.',
      'Folds flat into the carry case.',
    ]);
    expect(ps.filter((p) => p.kind === 'qa')).toHaveLength(3);
    expect(ps.find((p) => p.kind === 'qa')).toMatchObject({ question: 'Does the battery really last 30 hours?', group: 'q:q1' });
    expect(ps.filter((p) => p.group === 'r:0').map((p) => p.text)).toEqual(['Battery for days', 'I charge them once a week.', 'Sound is warm.']);
    expect(ps.find((p) => p.group === 'r:1')?.rating).toBe(2);
  });

  it('clips long passages at a word', () => {
    const [p] = productPassages({ ...src, bullets: [`${'word '.repeat(80)}end`], details: [], description: '', questions: [], reviews: [] });
    expect(p.text.length).toBeLessThanOrEqual(280);
    expect(p.text.endsWith('word…')).toBe(true);
  });
});

describe('rankPassages', () => {
  const ps = productPassages(src);

  it('finds the best matches across kinds, one per review or question, two per kind', () => {
    const out = rankPassages(askTerms('How long does the battery last?'), ps);
    expect(out[0]).toMatchObject({ kind: 'qa', question: 'Does the battery really last 30 hours?', text: 'Closer to 26 with noise cancelling on.' });
    expect(out.filter((p) => p.group === 'q:q1')).toHaveLength(1);
    expect(out.length).toBeLessThanOrEqual(4);
    for (const kind of ['details', 'qa', 'review'] as const) expect(out.filter((p) => p.kind === kind).length).toBeLessThanOrEqual(2);
    expect(out.some((p) => p.kind === 'details' && p.text.includes('battery life'))).toBe(true);
  });

  it('matches word forms (fold → Folds, charging → charge)', () => {
    expect(rankPassages(askTerms('does it fold'), ps).map((p) => p.text)).toEqual(expect.arrayContaining(['Folds flat into the carry case.', 'They fold flat.']));
    expect(rankPassages(askTerms('charging'), ps).map((p) => p.text)).toEqual(expect.arrayContaining(['I charge them once a week.']));
  });

  it('returns nothing when no word is found, or there are no terms', () => {
    expect(rankPassages(askTerms('is it waterproof'), ps)).toEqual([]);
    expect(rankPassages([], ps)).toEqual([]);
  });

  it('honours limit and perKind', () => {
    expect(rankPassages(askTerms('battery'), ps).map((p) => p.text)).toEqual([
      'Up to 30 hours of battery life with quick charging',
      'Closer to 26 with noise cancelling on.',
      'Battery for days',
      'The battery is fine though.',
    ]);
    expect(rankPassages(askTerms('battery'), ps, { perKind: 1 })).toHaveLength(3);
    expect(rankPassages(askTerms('battery'), ps, { limit: 2 })).toHaveLength(2);
  });

  it('needs a third of the terms matched', () => {
    // three terms: one is enough; six: two are needed
    expect(rankPassages(askTerms('battery waterproof shower'), ps).length).toBeGreaterThan(0);
    expect(rankPassages(askTerms('battery waterproof shower rain pool swim'), ps)).toEqual([]);
  });
});

describe('matchParts', () => {
  it('bolds whole words matching a term in any form', () => {
    expect(matchParts('Batteries charge fast; battery-life ok', ['battery', 'charg'])).toEqual([
      { text: 'Batteries', hit: true },
      { text: ' ', hit: false },
      { text: 'charge', hit: true },
      { text: ' fast; ', hit: false },
      { text: 'battery', hit: true },
      { text: '-life ok', hit: false },
    ]);
    expect(matchParts('nothing here', [])).toEqual([{ text: 'nothing here', hit: false }]);
  });
});

describe('askSuggestions', () => {
  it('asks about rated features, fit first, at most three', () => {
    expect(askSuggestions(['battery_life', 'comfort'])).toEqual(['How long does the battery last?', 'Is it comfortable?']);
    expect(askSuggestions(['comfort', 'durability', 'value_for_money'], true)).toEqual(['Does it run true to size?', 'Is it comfortable?', 'How long does it last?']);
    expect(askSuggestions([])).toEqual([]);
  });
});

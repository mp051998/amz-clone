import { describe, expect, it } from 'vitest';
import { countThemes, textMentions, themeWords } from './review-themes';

const r = (rating: number, body: string, title = '') => ({ rating, title, body });

describe('countThemes', () => {
  const themes = {
    praised: [{ theme: 'Value for money', count: 5460 }, { theme: 'Grip & comfort', count: 3533 }, { theme: 'Space-saving', count: 2248 }],
    criticized: [{ theme: 'Weight range', count: 1931 }, { theme: 'Battery life', count: 1073 }],
  };

  it('counts the reviews that mention each theme, not an estimate', () => {
    const reviews = [
      r(5, 'Worth every rupee.'),
      r(4, 'Great grip, and worth it.', 'Comfortable'),
      r(5, 'The grip never slips.'),
      r(4, 'Solid grip.'),
      r(2, 'The weight is off by a lot.'),
      r(3, 'Weights feel light.'),
      // a 5-star review doesn't make a complaint, nor a 2-star one praise
      r(5, 'Heavier weight than I expected, love it.'),
      r(1, 'Cheap and worth nothing.'),
    ];
    expect(countThemes(themes, reviews)).toEqual({
      praised: [{ theme: 'Grip & comfort', count: 3 }, { theme: 'Value for money', count: 2 }],
      criticized: [{ theme: 'Weight range', count: 2 }],
    });
  });

  it('has nothing to say without written reviews', () => {
    expect(countThemes(themes, [])).toEqual({ praised: [], criticized: [] });
  });
});

it('matches theme words at the start of a word, in the title or body', () => {
  expect(themeWords('Battery life')).toEqual(['battery', 'charge', 'charging']);
  expect(textMentions(r(5, 'Charges fast'), themeWords('Battery life'))).toBe(true);
  expect(textMentions(r(5, 'Recharge often', 'Meh'), ['charge'])).toBe(false);
  expect(textMentions({ title: 'Battery!', body: null }, ['battery'])).toBe(true);
  expect(textMentions(r(5, 'anything'), [])).toBe(false);
});

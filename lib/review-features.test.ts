import { expect, it } from 'vitest';
import { featureRatings, featuresFor, isReviewFeature, readFeatureStars } from './review-features';

it('asks the features of each category, none on books', () => {
  expect(featuresFor({ category: 'home-kitchen' })).toEqual(['easy_to_use', 'easy_to_clean', 'sturdiness', 'value_for_money']);
  expect(featuresFor({ category: 'mobiles' })).toEqual(['battery_life', 'camera_quality', 'screen_quality', 'value_for_money']);
  expect(featuresFor({ category: 'books' })).toEqual([]);
  expect(featuresFor({ category: 'nope' })).toEqual([]);
  expect(['comfort', 'value_for_money', 'Comfort', 'toString', 7].map(isReviewFeature)).toEqual([true, true, false, false, false]);
});

it('reads a stored review’s ratings, keeping known features rated 1 to 5', () => {
  expect(readFeatureStars({ comfort: 5, fun: 0, grip: 6, scent: 2.5, made_up: 3, durability: 1 })).toEqual({ comfort: 5, durability: 1 });
  expect(readFeatureStars(null)).toEqual({});
  expect(readFeatureStars([1, 2])).toEqual({});
});

it('shows a feature once 3 have rated it, to one decimal', () => {
  const rows = [
    { feature: 'value_for_money', average: 4.25, count: 7 },
    { feature: 'easy_to_use', average: 3.96, count: 12 },
    { feature: 'sturdiness', average: 5, count: 2 },
    { feature: 'retired_one', average: 4, count: 30 },
  ];
  expect(featureRatings(rows)).toEqual([
    { feature: 'easy_to_use', label: 'Easy to use', average: 4, count: 12 },
    { feature: 'value_for_money', label: 'Value for money', average: 4.3, count: 7 },
  ]);
  // just the category's, in its order
  expect(featureRatings(rows, ['sturdiness', 'value_for_money', 'easy_to_clean', 'easy_to_use']).map((f) => f.feature)).toEqual(['value_for_money', 'easy_to_use']);
});

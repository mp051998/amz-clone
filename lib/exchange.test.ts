import { expect, it } from 'vitest';
import { exchangeText, exchangeUpTo, exchangeValue, isExchangeCondition, isExchangeKind, readExchange, type ExchangeDevice } from './exchange';

const device = (id: string, valueMinor: number): ExchangeDevice => ({ id, kind: 'phone', brand: 'Apple', model: id, valueMinor });

it('values a device: in full working, half with a damaged screen, at most half the price', () => {
  expect(exchangeValue(2_100_000, 'good', 7_999_900)).toBe(2_100_000);
  expect(exchangeValue(2_100_000, 'screen_damaged', 7_999_900)).toBe(1_050_000);
  // rounds down, as place_order does
  expect(exchangeValue(999_999, 'screen_damaged', 7_999_900)).toBe(499_999);
  expect(exchangeValue(2_100_000, 'good', 839_900)).toBe(419_950);
  expect(exchangeValue(2_100_000, 'good', 0)).toBe(0);
});

it('says the most any model takes off ("Up to")', () => {
  const devices = [device('iphone-12', 1_600_000), device('iphone-14', 2_600_000), device('iphone-11', 1_200_000)];
  expect(exchangeUpTo(devices, 7_999_900)).toBe(2_600_000);
  expect(exchangeUpTo(devices, 3_000_000)).toBe(1_500_000);
  expect(exchangeUpTo([], 7_999_900)).toBe(0);
});

it('reads the device and condition, both or neither', () => {
  expect(readExchange(' apple-iphone-13 ', 'good')).toEqual({ deviceId: 'apple-iphone-13', condition: 'good' });
  expect(readExchange('apple-iphone-13', 'screen_damaged')).toEqual({ deviceId: 'apple-iphone-13', condition: 'screen_damaged' });
  expect(readExchange('apple-iphone-13', 'mint')).toBeNull();
  expect(readExchange('apple-iphone-13', null)).toBeNull();
  expect(readExchange('', 'good')).toBeNull();
  expect(readExchange(null, 'good')).toBeNull();
  expect(readExchange('x'.repeat(61), 'good')).toBeNull();
});

it('knows its kinds and conditions', () => {
  expect([isExchangeKind('phone'), isExchangeKind('laptop'), isExchangeKind('tablet'), isExchangeKind(null)]).toEqual([true, true, false, false]);
  expect([isExchangeCondition('good'), isExchangeCondition('screen_damaged'), isExchangeCondition('broken')]).toEqual([true, true, false]);
});

it('names the device with its condition', () => {
  expect(exchangeText('Apple iPhone 13', 'good')).toBe('Apple iPhone 13 (switches on, screen undamaged)');
  expect(exchangeText('Apple iPhone 13', 'screen_damaged')).toBe('Apple iPhone 13 (switches on, screen cracked or marked)');
});

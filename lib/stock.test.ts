import { expect, it } from 'vitest';
import { LOW_STOCK, lowStockText } from './stock';

it('warns from LOW_STOCK units down to the last one', () => {
  expect(LOW_STOCK).toBe(10);
  expect(lowStockText(10)).toBe('Only 10 left in stock');
  expect(lowStockText(1)).toBe('Only 1 left in stock');
  expect(lowStockText(11)).toBeNull();
  expect(lowStockText(0)).toBeNull();
});

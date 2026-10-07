import { expect, it } from 'vitest';
import { isReportReason, PRODUCT_REPORT_LABELS, PRODUCT_REPORT_REASONS, reportInputError } from './product-reports';

it('labels every reason', () => {
  expect(PRODUCT_REPORT_REASONS.every((r) => PRODUCT_REPORT_LABELS[r])).toBe(true);
  expect(isReportReason('pricing')).toBe(true);
  expect(isReportReason('spam')).toBe(false);
});

it('needs a reason, keeps details under 1000, and asks for words with “Something else”', () => {
  expect(reportInputError('', '')).toEqual({ field: 'reason', message: 'Choose what’s wrong with this product.' });
  expect(reportInputError('pricing', '')).toBeNull();
  expect(reportInputError('pricing', 'x'.repeat(1001))?.field).toBe('details');
  expect(reportInputError('other', '  wrong size ')).toBeNull();
  expect(reportInputError('other', ' short ')?.field).toBe('details');
});

/**
 * "Report an issue with this product": the reasons a shopper picks from and the limits on what
 * they write, shared by the product page form and the server (client-safe, no data access).
 */

export const PRODUCT_REPORT_REASONS = ['wrong_info', 'pricing', 'counterfeit', 'safety', 'offensive', 'other'] as const;
export type ProductReportReason = (typeof PRODUCT_REPORT_REASONS)[number];

export const PRODUCT_REPORT_LABELS: Record<ProductReportReason, string> = {
  wrong_info: 'Product details are wrong or missing',
  pricing: 'The price is wrong',
  counterfeit: 'It may be counterfeit or not genuine',
  safety: 'It’s unsafe or has been recalled',
  offensive: 'It’s offensive or inappropriate',
  other: 'Something else',
};

export const REPORT_DETAILS_MAX = 1000;
/** "Something else" needs a few words on what. */
export const REPORT_OTHER_MIN = 10;

export function isReportReason(v: unknown): v is ProductReportReason {
  return (PRODUCT_REPORT_REASONS as readonly unknown[]).includes(v);
}

/** What's wrong with a report as written, or null when it can be sent. */
export function reportInputError(reason: unknown, details: string): { field: 'reason' | 'details'; message: string } | null {
  if (!isReportReason(reason)) return { field: 'reason', message: 'Choose what’s wrong with this product.' };
  const text = details.trim();
  if (text.length > REPORT_DETAILS_MAX) return { field: 'details', message: `Keep it under ${REPORT_DETAILS_MAX} characters.` };
  if (reason === 'other' && text.length < REPORT_OTHER_MIN) return { field: 'details', message: `Tell us what’s wrong in at least ${REPORT_OTHER_MIN} characters.` };
  return null;
}

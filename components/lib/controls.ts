/**
 * Shared form-control classes so every select/dropdown across the app reads the
 * same: 33px tall, 7px radius, subtle white→gray gradient, orange focus ring
 * (matches the Input primitive). One source of truth = consistent chrome.
 */
export const selectClass =
  'h-[33px] cursor-pointer rounded-[7px] border border-line-2 bg-gradient-to-b from-surface-4 to-surface-2 px-2 text-[13px] text-ink shadow-input outline-none hover:border-line-3 focus:border-[#E77600] focus:ring-[3px] focus:ring-[rgb(228_121_17_/_0.45)]';

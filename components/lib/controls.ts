/**
 * Shared form-control classes (design.md §5 Inputs): 44px tall, radius 10, line-3 border,
 * white fill, border turns ink on hover/focus. One source of truth = consistent controls.
 */
export const fieldClass =
  'h-11 w-full rounded-input border border-line-3 bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-4 outline-none transition-colors hover:border-ink-3 focus:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:bg-surface-2 disabled:text-ink-4';

/** Native <select>: same as a field, with room for the chevron. */
export const selectClass =
  'h-11 cursor-pointer rounded-input border border-line-3 bg-surface pl-3 pr-8 text-[14px] text-ink outline-none transition-colors hover:border-ink-3 focus:border-ink';

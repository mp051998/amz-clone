import { messageFor } from '@/lib/data/errors';

/**
 * Why the last cart change didn't (fully) go through, from the query the cart actions redirect
 * with: `?error=code`, plus `skipped=n` when part of a bought-together bundle couldn't be added.
 */
export function cartNotice(error?: string | string[], skipped?: string | string[]): string | null {
  const code = Array.isArray(error) ? error[0] : error;
  if (!code) return null;
  const why = messageFor(code) ?? 'That change didn’t go through. Please try again.';
  const n = Number(Array.isArray(skipped) ? skipped[0] : skipped);
  if (!Number.isInteger(n) || n < 1) return why;
  return `${n === 1 ? 'One item' : `${n} items`} from the bundle couldn’t be added. ${why}`;
}

import { DataError } from '@/lib/data/errors';

/** An integer field of a request body: absent (undefined) or a whole number, else `422 invalid_input`. */
export function intField(b: Record<string, unknown>, key: string): number | undefined {
  const v = b[key];
  if (v == null) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new DataError('invalid_input', key);
  return v;
}

/** A string field of a request body: absent (undefined, or `422 invalid_input` when required) or a non-empty string. */
export function stringField(b: Record<string, unknown>, key: string, required = false): string | undefined {
  const v = b[key];
  if (v == null && !required) return undefined;
  if (typeof v !== 'string' || !v) throw new DataError('invalid_input', key);
  return v;
}

type ClassValue = string | number | false | null | undefined;

/** Minimal className joiner: keeps truthy strings/numbers, space-separated. No dedupe (YAGNI). */
export function cn(...values: ClassValue[]): string {
  return values.filter((v): v is string | number => Boolean(v)).join(' ');
}

/** Category slugs: lowercase words joined by single hyphens (they key URLs, products and saved searches). */
export const SLUG_MAX = 40;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Kitchen & Dining" → "kitchen-and-dining" (the default slug for a new category). */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '');
}

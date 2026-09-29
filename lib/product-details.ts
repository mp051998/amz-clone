/**
 * A product's "Product information" table: [label, value] rows, most important first
 * (`products.details`, a jsonb array of two-string arrays). Admins edit it as text, one
 * "Label: value" per line.
 */
export type DetailRow = [label: string, value: string];

export const DETAIL_LIMITS = { rows: 20, label: 40, value: 200, description: 2000 } as const;

/** Rows stored in the database; anything that isn't a pair of non-empty strings is dropped. */
export function toDetailRows(json: unknown): DetailRow[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((r): DetailRow[] =>
    Array.isArray(r) && r.length === 2 && typeof r[0] === 'string' && typeof r[1] === 'string' && r[0].trim() && r[1].trim()
      ? [[r[0].trim(), r[1].trim()]]
      : [],
  );
}

/** Rows → the admin textarea's text. */
export function detailLines(rows: readonly DetailRow[]): string {
  return rows.map(([k, v]) => `${k}: ${v}`).join('\n');
}

/**
 * The admin textarea's text → rows. Each non-blank line is "Label: value", split at the first
 * colon (so values may contain colons, e.g. "Battery life: Up to 30 h: ANC off").
 */
export function parseDetailLines(text: string): { rows: DetailRow[]; error?: string } {
  const rows: DetailRow[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const at = line.indexOf(':');
    const label = at > 0 ? line.slice(0, at).trim() : '';
    const value = at > 0 ? line.slice(at + 1).trim() : '';
    if (!label || !value) return { rows, error: `Line ${i + 1}: write it as “Label: value”` };
    rows.push([label, value]);
  }
  return { rows };
}

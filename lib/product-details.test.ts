import { describe, expect, it } from 'vitest';
import { detailLines, parseDetailLines, toDetailRows } from './product-details';

describe('product details', () => {
  it('reads only well-formed rows from the database', () => {
    expect(toDetailRows([['Brand', 'Sony'], [' Color ', ' Black '], ['', 'x'], ['Only one'], 'nope', [1, 2]])).toEqual([
      ['Brand', 'Sony'],
      ['Color', 'Black'],
    ]);
    expect(toDetailRows(null)).toEqual([]);
    expect(toDetailRows({ Brand: 'Sony' })).toEqual([]);
  });

  it('round-trips the admin text', () => {
    const rows = parseDetailLines('Brand: Sony\n\n  Battery life: Up to 35 h: ANC off  \nColor:Black').rows;
    expect(rows).toEqual([
      ['Brand', 'Sony'],
      ['Battery life', 'Up to 35 h: ANC off'],
      ['Color', 'Black'],
    ]);
    expect(parseDetailLines(detailLines(rows)).rows).toEqual(rows);
  });

  it('points at the first line that is not "Label: value"', () => {
    expect(parseDetailLines('Brand: Sony\nBlack').error).toBe('Line 2: write it as “Label: value”');
    expect(parseDetailLines(': Black').error).toBe('Line 1: write it as “Label: value”');
    expect(parseDetailLines('Color:').error).toBe('Line 1: write it as “Label: value”');
    expect(parseDetailLines('  \n').rows).toEqual([]);
  });
});

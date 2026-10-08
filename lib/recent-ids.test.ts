import { describe, expect, it } from 'vitest';
import { nextRecent, parseIds, parseRecent, RECENT_MAX } from './recent-ids';

describe('browsing history cookie', () => {
  it('puts the product first, dedupes and caps', () => {
    expect(nextRecent('a,b,c', 'b')).toEqual(['b', 'a', 'c']);
    expect(nextRecent(null, 'x')).toEqual(['x']);
    const many = Array.from({ length: RECENT_MAX + 10 }, (_, i) => `p${i}`).join(',');
    expect(nextRecent(many, 'new')).toHaveLength(RECENT_MAX);
    expect(nextRecent(many, 'new')[0]).toBe('new');
  });

  it('reads encoded values and drops junk', () => {
    expect(parseRecent(encodeURIComponent('a,b,a'))).toEqual(['a', 'b']);
    expect(parseRecent('a, ,<script>,b')).toEqual(['a', 'b']);
    expect(parseRecent('%E0%A4%A')).toEqual([]);
    expect(parseRecent(undefined)).toEqual([]);
  });

  it('reads other id lists up to their own cap', () => {
    const many = Array.from({ length: RECENT_MAX + 10 }, (_, i) => `p${i}`).join(',');
    expect(parseIds(many, 100)).toHaveLength(RECENT_MAX + 10);
    expect(parseIds('a,b,c', 2)).toEqual(['a', 'b']);
  });
});

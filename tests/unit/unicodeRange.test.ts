import { describe, expect, it } from 'vitest';
import { unicodeRangeIncludes } from '@/lib/unicodeRange';

/**
 * CSS font faces declare a comma-separated `unicode-range`; a wrong match here
 * would either reject a loaded font or let an offline fallback face pass.
 */
describe('unicodeRangeIncludes', () => {
  it('finds a code point in any comma-separated range, so a later font subset is not ignored', () => {
    expect(unicodeRangeIncludes('U+3000-30FF, U+4E00-9FFF', 0x5146)).toBe(true);
    expect(unicodeRangeIncludes('U+3000-30FF, U+4E00-9FFF', 0x3042)).toBe(true);
  });

  it('accepts either case of the U+ prefix, which CSS permits before every range', () => {
    expect(unicodeRangeIncludes('u+4E00-9FFF', 0x5146)).toBe(true);
  });

  it('expands wildcards into their inclusive range, so a loaded CSS face is not rejected', () => {
    expect(unicodeRangeIncludes('U+4??', 0x400)).toBe(true);
    expect(unicodeRangeIncludes('U+4??', 0x4ff)).toBe(true);
    expect(unicodeRangeIncludes('U+4??', 0x3ff)).toBe(false);
    expect(unicodeRangeIncludes('U+4??', 0x500)).toBe(false);
  });

  it('matches a singleton range, so a loaded face is not mistaken for a fallback', () => {
    expect(unicodeRangeIncludes('U+3005', 0x3005)).toBe(true);
    expect(unicodeRangeIncludes('U+3005', 0x3006)).toBe(false);
  });

  it('includes both range boundaries, so a subset edge cannot pass or fail by one code point', () => {
    expect(unicodeRangeIncludes('U+5019-5146', 0x5019)).toBe(true);
    expect(unicodeRangeIncludes('U+5019-5146', 0x5146)).toBe(true);
    expect(unicodeRangeIncludes('U+5019-5146', 0x5018)).toBe(false);
    expect(unicodeRangeIncludes('U+5019-5146', 0x5147)).toBe(false);
  });
});

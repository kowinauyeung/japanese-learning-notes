/** Whether a CSS unicode-range includes a Unicode code point. */
export function unicodeRangeIncludes(range: string, codePoint: number): boolean {
  return range.split(',').some((part) => {
    const [start, end] = part.trim().replace(/^u\+/i, '').split('-');
    const low = Number.parseInt((start ?? '').replace(/\?/g, '0'), 16);
    const high = Number.parseInt((end ?? start ?? '').replace(/\?/g, 'F'), 16);
    return codePoint >= low && codePoint <= high;
  });
}

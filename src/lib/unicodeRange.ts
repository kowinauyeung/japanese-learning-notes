/** Whether a CSS unicode-range includes a Unicode code point. */
export function unicodeRangeIncludes(range: string, codePoint: number): boolean {
  return range.split(',').some((part) => {
    const [start, end] = part.trim().replace(/^u\+/i, '').split('-');
    const low = Number.parseInt(start ?? '', 16);
    const high = end === undefined ? low : Number.parseInt(end, 16);
    return codePoint >= low && codePoint <= high;
  });
}

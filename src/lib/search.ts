/** Fold full-width katakana to hiragana while retaining literal substring matching. */
export function normalizeSearchText(text: string): string {
  return text
    .replace(/[ァ-ヶ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .toLowerCase();
}

/** Match offsets in the original text, so highlights preserve its spelling. */
export function searchMatchRanges(text: string, query: string): { start: number; end: number }[] {
  const keyword = normalizeSearchText(query.trim());
  if (!keyword) return [];

  // Lowercasing can expand a character (e.g. İ), so normalized offsets cannot
  // always be used to slice the original string directly.
  const offsets: { start: number; end: number }[] = [];
  let position = 0;
  for (const char of text) {
    const end = position + char.length;
    for (let i = 0; i < normalizeSearchText(char).length; i++) {
      offsets.push({ start: position, end });
    }
    position = end;
  }

  const normalized = normalizeSearchText(text);
  const ranges: { start: number; end: number }[] = [];
  let from = 0;
  let index = normalized.indexOf(keyword, from);
  while (index !== -1) {
    const start = offsets[index]!.start;
    const end = offsets[index + keyword.length - 1]!.end;
    const previous = ranges.at(-1);
    if (previous && start < previous.end) previous.end = end;
    else ranges.push({ start, end });
    from = index + keyword.length;
    index = normalized.indexOf(keyword, from);
  }
  return ranges;
}

const KANJI = /[一-龯々〆ヵヶ]/;

export interface FuriganaSegment {
  base: string;
  /** Empty for okurigana and other kana that need no annotation. */
  rt: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split a headword into runs and give each kanji run its own reading, so the
 * annotation sits over the characters it belongs to.
 *
 * The entries only store a whole-word reading, so the okurigana is used as
 * anchors to cut it up: 切り分け / きりわけ has り and け in both strings, which
 * pins 切→き and 分→わ. A run of adjacent kanji has no anchor between them and
 * stays together — 兆候 keeps ちょうこう across both characters, since splitting
 * that would need a dictionary.
 *
 * Anything that fails to line up falls back to one annotation over the whole
 * word, which is never wrong, only less precise.
 */
export function segmentFurigana(headword: string, reading: string): FuriganaSegment[] {
  if (!reading || reading === headword || !KANJI.test(headword)) {
    return [{ base: headword, rt: '' }];
  }

  const runs: { kanji: boolean; text: string }[] = [];
  for (const char of headword) {
    const isKanji = KANJI.test(char);
    const last = runs.at(-1);
    if (last && last.kanji === isKanji) last.text += char;
    else runs.push({ kanji: isKanji, text: char });
  }

  // Kana runs become literals; each kanji run becomes a lazy capture, so the
  // shortest reading that still satisfies the following anchor wins.
  const pattern = runs
    .map((run) => (run.kanji ? '(.+?)' : escapeRegExp(run.text)))
    .join('');
  const match = reading.match(new RegExp(`^${pattern}$`));
  if (!match) return [{ base: headword, rt: reading }];

  let group = 1;
  return runs.map((run) =>
    run.kanji ? { base: run.text, rt: match[group++] } : { base: run.text, rt: '' },
  );
}

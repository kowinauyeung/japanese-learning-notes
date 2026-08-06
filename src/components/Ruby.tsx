const KANJI = /[一-龯々〆ヵヶ]/;

/**
 * Furigana over the whole word rather than per character, as the handoff
 * specifies. Kana-only headwords carry no reading and need no ruby.
 */
export function Ruby({
  headword,
  reading,
  className,
}: {
  headword: string;
  reading: string;
  className?: string;
}) {
  if (!reading || reading === headword || !KANJI.test(headword)) {
    return <span className={className}>{headword}</span>;
  }
  return (
    <ruby className={className}>
      {headword}
      <rt>{reading}</rt>
    </ruby>
  );
}
